import { GitHubSyncConfig, GitHubSyncPayload, Product } from '../types';

export type { GitHubSyncConfig, GitHubSyncPayload };

const STORAGE_KEY = 'saas_github_sync_config_v1';

export const DEFAULT_GITHUB_CONFIG: GitHubSyncConfig = {
  token: '',
  username: 'contalayka',
  repoName: 'PesquisaNovo',
  repo: 'contalayka/PesquisaNovo',
  branch: 'main',
  filePath: 'data/app_data_sync.json',
  autoPush: true,
};

export function getStoredGitHubConfig(): GitHubSyncConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GITHUB_CONFIG };
    const parsed = JSON.parse(raw);
    let username = (parsed.username || '').trim();
    let repoName = (parsed.repoName || '').trim();
    if ((!username || !repoName) && parsed.repo) {
      const parts = parsed.repo.trim().split('/').filter(Boolean);
      if (parts.length >= 2) {
        if (!username) username = parts[0];
        if (!repoName) repoName = parts[1];
      }
    }
    if (!username) username = DEFAULT_GITHUB_CONFIG.username;
    if (!repoName) repoName = DEFAULT_GITHUB_CONFIG.repoName;
    const repo = `${username}/${repoName}`;

    return {
      token: (parsed.token || '').trim(),
      username,
      repoName,
      repo,
      branch: (parsed.branch || DEFAULT_GITHUB_CONFIG.branch).trim(),
      filePath: (parsed.filePath || DEFAULT_GITHUB_CONFIG.filePath).trim(),
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
    const username = (config.username || '').trim();
    const repoName = (config.repoName || '').trim();
    const repo = username && repoName ? `${username}/${repoName}` : (config.repo || '').trim();
    const normalized: GitHubSyncConfig = {
      ...config,
      token: (config.token || '').trim(),
      username,
      repoName,
      repo,
      branch: (config.branch || 'main').trim(),
      filePath: (config.filePath || DEFAULT_GITHUB_CONFIG.filePath).trim(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.error('Falha ao salvar configuração do GitHub no localStorage:', err);
  }
}

export function isGitHubSyncConfigured(config: GitHubSyncConfig = getStoredGitHubConfig()): boolean {
  const hasCreds = Boolean(config.token?.trim());
  const hasTarget = Boolean((config.username?.trim() && config.repoName?.trim()) || config.repo?.trim());
  return hasCreds && hasTarget;
}

/**
 * Codificação compatível com caracteres UTF-8 e grandes volumes de dados sem estouro de pilha
 */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const CHUNK_SIZE = 0x8000; // 32KB chunks
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
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

export function parseRepo(config: GitHubSyncConfig | string): { owner: string; repoName: string } {
  if (typeof config === 'object') {
    let owner = (config.username || '').trim().replace(/^@/, '');
    let repoName = (config.repoName || '').trim();

    // Se usuário colou a URL completa ou formato user/repo no repoName
    if (repoName.includes('github.com')) {
      const match = repoName.match(/github\.com\/([^/]+)\/([^/.]+)/);
      if (match) {
        owner = match[1];
        repoName = match[2];
      }
    } else if (repoName.includes('/')) {
      const parts = repoName.split('/').filter(Boolean);
      if (parts.length >= 2) {
        owner = parts[0];
        repoName = parts[1];
      }
    }

    if (owner && repoName) {
      return {
        owner: owner.replace(/^@/, '').replace(/\.git$/, '').trim(),
        repoName: repoName.replace(/\.git$/, '').trim(),
      };
    }

    if (config.repo?.trim()) {
      const clean = config.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
      const parts = clean.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return { owner: parts[0], repoName: parts[1] };
      }
    }
    throw new Error('Informe o Nome do Usuário (ex: contalayka) e o Nome do Repositório (ex: pesquisaproduto).');
  }

  const clean = config.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('Formato de repositório inválido. Utilize "usuario/repositorio" (Ex: contalayka/pesquisaproduto).');
  }
  return { owner: parts[0], repoName: parts[1] };
}

function getHeaders(token: string) {
  const cleanToken = token.trim();
  // Classic tokens e Fine-Grained tokens do GitHub aceitam Bearer ou token
  const authHeader = cleanToken.startsWith('Bearer ') || cleanToken.startsWith('token ')
    ? cleanToken
    : `Bearer ${cleanToken}`;
  return {
    Accept: 'application/vnd.github+json',
    Authorization: authHeader,
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
    return { success: false, message: 'Informe as credenciais (Token de Acesso PAT) do GitHub.' };
  }
  if (!config.username?.trim() && !config.repo?.trim()) {
    return { success: false, message: 'Informe o Nome do Usuário do GitHub.' };
  }
  if (!config.repoName?.trim() && !config.repo?.trim()) {
    return { success: false, message: 'Informe o Nome do Repositório do GitHub.' };
  }

  try {
    const { owner, repoName } = parseRepo(config);
    const headers = getHeaders(config.token);

    // 1. Testa acesso ao repositório
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      method: 'GET',
      headers,
    });

    if (repoRes.status === 401) {
      return {
        success: false,
        message: 'Token de Acesso inválido ou expirado (401). Gere um novo token no GitHub com escopo "repo".',
      };
    }

    if (repoRes.status === 404) {
      return {
        success: false,
        message: `Repositório "${owner}/${repoName}" não encontrado ou token sem acesso (404). Verifique o nome do usuário e do repositório.`,
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
      branchMsg = `Aviso: A branch "${targetBranch}" será criada automaticamente no primeiro Push.`;
    }

    if (!canPush) {
      return {
        success: false,
        message: `Conectado a ${repoData.full_name}, mas o token NÃO possui permissão de gravação (push). Habilite o escopo "repo" ou "Contents: Read & write" no token.`,
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
      message: err.message || 'Falha de rede ao contatar a API do GitHub. Verifique a conexão com a internet.',
    };
  }
}

/**
 * Obtém o SHA atual do arquivo no repositório remoto (se existir)
 * Suporta arquivos grandes via download_url ou blobs, com anti-cache garantido
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
  )}&_cb=${Date.now()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...headers,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
    cache: 'no-store',
  });

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
 * Com retry automático contra conflitos de SHA (409 / 422)
 */
export async function pushDataToGitHub(
  config: GitHubSyncConfig,
  payload: GitHubSyncPayload,
  commitMessage?: string
): Promise<{ success: boolean; message: string; commitSha?: string }> {
  if (!isGitHubSyncConfigured(config)) {
    return { success: false, message: 'GitHub não configurado. Preencha as credenciais (Token), Usuário e Repositório.' };
  }

  try {
    const { owner, repoName } = parseRepo(config);
    const headers = getHeaders(config.token);
    const branch = config.branch?.trim() || 'main';
    const cleanPath = (config.filePath?.trim() || DEFAULT_GITHUB_CONFIG.filePath).replace(/^\/+/, '');

    // Prepara o conteúdo em Base64
    const jsonStr = JSON.stringify(payload, null, 2);
    const contentBase64 = utf8ToBase64(jsonStr);

    const defaultMsg = `Sincronização de catálogo: ${payload.totalProducts} produtos [${new Date().toLocaleString(
      'pt-BR'
    )}]`;
    const message = commitMessage || defaultMsg;
    const putUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${cleanPath}`;

    let putRes: Response | null = null;
    let lastErrorMsg = '';

    // Loop com até 3 tentativas para resolver conflitos de SHA concorrentes automaticamente
    for (let attempt = 0; attempt < 3; attempt++) {
      // 1. Busca o SHA atual em tempo real sem cache
      const { sha: currentSha } = await getRemoteFileSha(owner, repoName, cleanPath, branch, headers);

      const body: Record<string, unknown> = {
        message,
        content: contentBase64,
        branch,
      };
      if (currentSha) {
        body.sha = currentSha;
      }

      putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store',
        },
        body: JSON.stringify(body),
      });

      if (putRes.ok) {
        break;
      }

      const errData = await putRes.clone().json().catch(() => ({}));
      lastErrorMsg = errData.message || '';

      // Se for conflito de SHA desatualizado (409 ou 422 "does not match"), aguarda e tenta novamente com o SHA novo
      const isShaConflict =
        putRes.status === 409 ||
        putRes.status === 422 ||
        lastErrorMsg.toLowerCase().includes('does not match') ||
        lastErrorMsg.toLowerCase().includes('conflict');

      if (isShaConflict && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        continue;
      } else {
        break;
      }
    }

    if (!putRes || !putRes.ok) {
      const err = await putRes?.json().catch(() => ({}));
      let msg = err?.message || lastErrorMsg || `Erro ao salvar arquivo no GitHub (HTTP ${putRes?.status || 500}).`;
      if (putRes?.status === 401) {
        msg = 'Token de acesso inválido ou expirado (401). Gere um novo token no GitHub com permissão "repo".';
      } else if (putRes?.status === 404) {
        msg = `Repositório "${owner}/${repoName}" ou branch "${branch}" não encontrado. Verifique se o nome do repositório está correto.`;
      } else if (putRes?.status === 403) {
        msg = `Sem permissão de gravação no repositório "${owner}/${repoName}". Certifique-se de que o token possui permissão "repo" ou "Contents: Read & write".`;
      } else if (putRes?.status === 422) {
        if (msg.includes('does not match')) {
          msg = 'Conflito de versão sincronizado. Clique em Sincronizar novamente para confirmar.';
        } else {
          msg = `Erro de validação no GitHub (422): ${msg}.`;
        }
      }
      return {
        success: false,
        message: msg,
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
 * Suporta arquivos grandes via API de contents ou download_url
 */
export async function pullDataFromGitHub(config: GitHubSyncConfig): Promise<{
  success: boolean;
  message: string;
  data?: GitHubSyncPayload;
}> {
  if (!isGitHubSyncConfigured(config)) {
    return { success: false, message: 'GitHub não configurado. Preencha as credenciais (Token), Usuário e Repositório.' };
  }

  try {
    const { owner, repoName } = parseRepo(config);
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

    let decodedJson = '';
    const rawContent = fileInfo.rawData.content;

    if (rawContent) {
      decodedJson = base64ToUtf8(rawContent);
    } else if (fileInfo.rawData.download_url) {
      // Arquivo > 1MB: GitHub Contents API não inclui content base64, usa download_url
      const dlRes = await fetch(`${fileInfo.rawData.download_url}?_cb=${Date.now()}`, {
        method: 'GET',
        headers: {
          Authorization: headers.Authorization,
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
        cache: 'no-store',
      });
      if (!dlRes.ok) {
        throw new Error(`Falha ao baixar arquivo grande do GitHub (${dlRes.status})`);
      }
      decodedJson = await dlRes.text();
    } else if (fileInfo.sha) {
      // Fallback via Blob API
      const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/blobs/${fileInfo.sha}?_cb=${Date.now()}`, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      if (blobRes.ok) {
        const blobData = await blobRes.json();
        if (blobData.content) {
          decodedJson = base64ToUtf8(blobData.content);
        }
      }
    }

    if (!decodedJson || !decodedJson.trim()) {
      return {
        success: false,
        message: 'O arquivo remoto no GitHub está vazio.',
      };
    }

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

export type GitHubSyncStatusColor = 'green' | 'yellow' | 'red';

export interface GitHubSyncStatusInfo {
  status: GitHubSyncStatusColor;
  label: string;
  relativeTime: string;
  tooltip: string;
  formattedDate: string;
}

export function getGitHubSyncStatusInfo(config: GitHubSyncConfig): GitHubSyncStatusInfo {
  if (!isGitHubSyncConfigured(config)) {
    return {
      status: 'yellow',
      label: 'Desconectado',
      relativeTime: 'Configurar',
      tooltip: 'GitHub não configurado. Clique para cadastrar as credenciais do repositório.',
      formattedDate: '',
    };
  }

  if (!config.lastSyncedAt) {
    return {
      status: 'yellow',
      label: 'Pendente',
      relativeTime: 'Pendente',
      tooltip: `Conectado a ${config.username || 'user'}/${config.repoName || 'repo'} (${config.branch || 'main'}), mas nenhum push/pull foi realizado ainda.`,
      formattedDate: '',
    };
  }

  try {
    const syncDate = new Date(config.lastSyncedAt);
    const now = new Date();
    const diffMs = now.getTime() - syncDate.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    const formattedDate = syncDate.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    let relativeTime = 'agora';
    let status: GitHubSyncStatusColor = 'green';

    if (diffMin < 1) {
      relativeTime = 'agora mesmo';
      status = 'green';
    } else if (diffMin < 60) {
      relativeTime = `há ${diffMin} min`;
      status = 'green';
    } else if (diffHours < 24) {
      relativeTime = `há ${diffHours}h`;
      status = diffHours <= 4 ? 'green' : 'yellow';
    } else {
      relativeTime = `há ${diffDays}d`;
      status = 'yellow';
    }

    const typeDesc = config.lastSyncType === 'pull' ? 'Pull (Download)' : 'Push (Envio)';
    const tooltip = `Último ${typeDesc}: ${syncDate.toLocaleString('pt-BR')} (${config.username}/${config.repoName} @ ${config.branch})`;

    return {
      status,
      label: 'Sincronizado',
      relativeTime,
      tooltip,
      formattedDate,
    };
  } catch {
    return {
      status: 'red',
      label: 'Erro',
      relativeTime: 'Inválido',
      tooltip: 'Data de sincronização corrompida.',
      formattedDate: '',
    };
  }
}

