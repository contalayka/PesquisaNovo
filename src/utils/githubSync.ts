import { GitHubSyncConfig, GitHubSyncPayload, Product } from '../types';

export type { GitHubSyncConfig, GitHubSyncPayload };

const STORAGE_KEY = 'saas_github_sync_config_v1';

export const DEFAULT_GITHUB_CONFIG: GitHubSyncConfig = {
  token: '',
  repo: 'contalayka/pesquisaproduto',
  branch: 'main',
  filePath: 'data/app_data_sync.json',
  autoPush: false,
};

export function getStoredGitHubConfig(): GitHubSyncConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GITHUB_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      token: parsed.token || '',
      repo: parsed.repo || DEFAULT_GITHUB_CONFIG.repo,
      branch: parsed.branch || DEFAULT_GITHUB_CONFIG.branch,
      filePath: parsed.filePath || DEFAULT_GITHUB_CONFIG.filePath,
      autoPush: Boolean(parsed.autoPush),
      lastSyncedAt: parsed.lastSyncedAt,
      lastSyncType: parsed.lastSyncType,
      lastCommitSha: parsed.lastCommitSha,
    };
  } catch {
    return { ...DEFAULT_GITHUB_CONFIG };
  }
}

export function saveStoredGitHubConfig(config: GitHubSyncConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Falha ao salvar configuração do GitHub no localStorage:', err);
  }
}

export function isGitHubSyncConfigured(config: GitHubSyncConfig = getStoredGitHubConfig()): boolean {
  return Boolean(config.token?.trim() && config.repo?.trim());
}

/**
 * Codificação compatível com caracteres UTF-8 (acentos, cedilha, emojis)
 */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodificação compatível com caracteres UTF-8
 */
export function base64ToUtf8(b64: string): string {
  const cleanB64 = b64.replace(/\s+/g, '');
  const binary = atob(cleanB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function parseRepo(repo: string): { owner: string; repoName: string } {
  const clean = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('Formato de repositório inválido. Utilize "usuario/repositorio" (Ex: contalayka/pesquisaproduto).');
  }
  return { owner: parts[0], repoName: parts[1] };
}

function getHeaders(token: string) {
  const cleanToken = token.trim();
  return {
    Accept: 'application/vnd.github+json',
    Authorization: cleanToken.startsWith('Bearer ') || cleanToken.startsWith('token ')
      ? cleanToken
      : `Bearer ${cleanToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Testa a conexão e as permissões de leitura/gravação com o GitHub
 */
export async function testGitHubConnection(config: GitHubSyncConfig): Promise<{
  success: boolean;
  message: string;
  repoInfo?: { fullName: string; defaultBranch: string; canPush: boolean; isPrivate: boolean };
}> {
  if (!config.token?.trim()) {
    return { success: false, message: 'Informe o Token de Acesso Pessoal (PAT) do GitHub.' };
  }
  if (!config.repo?.trim()) {
    return { success: false, message: 'Informe o Repositório no formato usuario/repositorio.' };
  }

  try {
    const { owner, repoName } = parseRepo(config.repo);
    const headers = getHeaders(config.token);

    // 1. Testa acesso ao repositório
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      method: 'GET',
      headers,
    });

    if (repoRes.status === 401) {
      return {
        success: false,
        message: 'Token de Acesso inválido ou expirado. Verifique as credenciais no GitHub.',
      };
    }

    if (repoRes.status === 404) {
      return {
        success: false,
        message: `Repositório "${owner}/${repoName}" não encontrado ou token sem permissão de acesso.`,
      };
    }

    if (!repoRes.ok) {
      const errData = await repoRes.json().catch(() => ({}));
      return {
        success: false,
        message: errData.message || `Erro HTTP ${repoRes.status} ao conectar com GitHub.`,
      };
    }

    const repoData = await repoRes.json();
    const canPush = repoData.permissions?.push ?? true;

    // 2. Valida se a branch existe
    const targetBranch = config.branch?.trim() || repoData.default_branch || 'main';
    const branchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/branches/${encodeURIComponent(targetBranch)}`,
      { method: 'GET', headers }
    );

    let branchMsg = `Branch "${targetBranch}" validada.`;
    if (!branchRes.ok && branchRes.status === 404) {
      branchMsg = `Aviso: A branch "${targetBranch}" ainda não foi encontrada no repositório.`;
    }

    if (!canPush) {
      return {
        success: false,
        message: `Conectado ao repositório ${repoData.full_name}, mas o token NÃO tem permissão de escrita (push). Conceda permissão de Contents: Read & Write ou repo.`,
        repoInfo: {
          fullName: repoData.full_name,
          defaultBranch: repoData.default_branch,
          canPush: false,
          isPrivate: repoData.private,
        },
      };
    }

    return {
      success: true,
      message: `Conexão bem-sucedida com ${repoData.full_name}! ${branchMsg} Permissão de gravação ativa.`,
      repoInfo: {
        fullName: repoData.full_name,
        defaultBranch: repoData.default_branch,
        canPush: true,
        isPrivate: repoData.private,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Falha de rede ao contatar a API do GitHub.',
    };
  }
}

/**
 * Obtém o SHA atual do arquivo no repositório remoto (se existir)
 */
async function getRemoteFileSha(
  owner: string,
  repo: string,
  filePath: string,
  branch: string,
  headers: Record<string, string>
): Promise<{ sha?: string; exists: boolean; rawData?: any }> {
  const cleanPath = filePath.replace(/^\/+/, '');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}?ref=${encodeURIComponent(
    branch
  )}`;

  const res = await fetch(url, { method: 'GET', headers });
  if (res.status === 404) {
    return { exists: false };
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erro ao consultar arquivo remoto (${res.status})`);
  }
  const data = await res.json();
  return { sha: data.sha, exists: true, rawData: data };
}

/**
 * Faz Push (upload/commit) dos dados locais para o repositório GitHub
 */
export async function pushDataToGitHub(
  config: GitHubSyncConfig,
  payload: GitHubSyncPayload,
  commitMessage?: string
): Promise<{ success: boolean; message: string; commitSha?: string }> {
  if (!config.token?.trim() || !config.repo?.trim()) {
    return { success: false, message: 'GitHub não configurado. Preencha o Token e Repositório.' };
  }

  try {
    const { owner, repoName } = parseRepo(config.repo);
    const headers = getHeaders(config.token);
    const branch = config.branch?.trim() || 'main';
    const cleanPath = (config.filePath?.trim() || DEFAULT_GITHUB_CONFIG.filePath).replace(/^\/+/, '');

    // 1. Busca o SHA atual se o arquivo já existir
    const { sha: existingSha } = await getRemoteFileSha(owner, repoName, cleanPath, branch, headers);

    // 2. Prepara o conteúdo
    const jsonStr = JSON.stringify(payload, null, 2);
    const contentBase64 = utf8ToBase64(jsonStr);

    const defaultMsg = `Sincronização de catálogo: ${payload.totalProducts} produtos [${new Date().toLocaleString(
      'pt-BR'
    )}]`;
    const message = commitMessage || defaultMsg;

    // 3. Executa o PUT /contents/{path}
    const putUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${cleanPath}`;
    const body: Record<string, unknown> = {
      message,
      content: contentBase64,
      branch,
    };
    if (existingSha) {
      body.sha = existingSha;
    }

    let putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Se der conflito 409 (SHA concorrente), tenta recuperar o SHA novo e reexecutar
    if (putRes.status === 409) {
      const refreshed = await getRemoteFileSha(owner, repoName, cleanPath, branch, headers);
      if (refreshed.sha) {
        body.sha = refreshed.sha;
        putRes = await fetch(putUrl, {
          method: 'PUT',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      }
    }

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      return {
        success: false,
        message: err.message || `Erro ao salvar arquivo no GitHub (HTTP ${putRes.status}).`,
      };
    }

    const resData = await putRes.json();
    const commitSha = resData.commit?.sha || resData.content?.sha;

    // Atualiza estado de sincronização
    const updatedConfig: GitHubSyncConfig = {
      ...config,
      lastSyncedAt: new Date().toISOString(),
      lastSyncType: 'push',
      lastCommitSha: commitSha,
    };
    saveStoredGitHubConfig(updatedConfig);

    return {
      success: true,
      message: `Alterações enviadas para o GitHub com sucesso (${payload.totalProducts} produtos salvos na branch "${branch}")!`,
      commitSha,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Falha ao sincronizar dados com o GitHub.',
    };
  }
}

/**
 * Faz Pull (download) dos dados armazenados no repositório remoto para carregar na máquina atual
 */
export async function pullDataFromGitHub(config: GitHubSyncConfig): Promise<{
  success: boolean;
  message: string;
  data?: GitHubSyncPayload;
}> {
  if (!config.token?.trim() || !config.repo?.trim()) {
    return { success: false, message: 'GitHub não configurado. Preencha o Token e Repositório.' };
  }

  try {
    const { owner, repoName } = parseRepo(config.repo);
    const headers = getHeaders(config.token);
    const branch = config.branch?.trim() || 'main';
    const cleanPath = (config.filePath?.trim() || DEFAULT_GITHUB_CONFIG.filePath).replace(/^\/+/, '');

    const fileInfo = await getRemoteFileSha(owner, repoName, cleanPath, branch, headers);
    if (!fileInfo.exists || !fileInfo.rawData) {
      return {
        success: false,
        message: `O arquivo "${cleanPath}" ainda não existe na branch "${branch}". Faça um primeiro "Push" a partir de uma máquina com dados para criá-lo.`,
      };
    }

    const rawContent = fileInfo.rawData.content;
    if (!rawContent) {
      return {
        success: false,
        message: 'O arquivo remoto está vazio ou em formato não suportado.',
      };
    }

    const decodedJson = base64ToUtf8(rawContent);
    const parsed = JSON.parse(decodedJson);

    // Valida payload
    let products: Product[] = [];
    if (Array.isArray(parsed)) {
      products = parsed;
    } else if (Array.isArray(parsed.products)) {
      products = parsed.products;
    } else {
      return {
        success: false,
        message: 'Estrutura de dados inválida no arquivo do GitHub (esperava lista de produtos).',
      };
    }

    const payload: GitHubSyncPayload = {
      version: parsed.version || '2.0',
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      source: parsed.source || 'github-sync',
      totalProducts: products.length,
      products,
      pricingSettings: parsed.pricingSettings,
    };

    // Atualiza estado de sincronização
    const updatedConfig: GitHubSyncConfig = {
      ...config,
      lastSyncedAt: new Date().toISOString(),
      lastSyncType: 'pull',
      lastCommitSha: fileInfo.sha,
    };
    saveStoredGitHubConfig(updatedConfig);

    return {
      success: true,
      message: `${products.length} produtos importados do GitHub com sucesso!`,
      data: payload,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Falha ao baixar dados do GitHub.',
    };
  }
}
