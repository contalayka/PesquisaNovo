// Test acceptance suite importing the official core logic
const { execSync } = require('child_process');

async function main() {
  console.log('=== TESTE DE ACEITAÇÃO OBRIGATÓRIO (MLB2901308748) ===');
  const t0 = Date.now();
  
  const cmd = `npx tsx -e "
    import { scanMercadoLivreAd } from './src/utils/marketplaceScannerCore';
    async function run() {
      const url = 'https://www.mercadolivre.com.br/sq-cozinha-sf-400-branco-10-kg-balanca/p/MLB15462294?pdp_filters=item_id%3AMLB2901308748';
      const results = await scanMercadoLivreAd(url, 'Balança de Cozinha SF-400');
      console.log('Candidatos encontrados:', results.length);
      results.slice(0, 3).forEach((c, i) => {
        console.log('[Candidato ' + (i + 1) + ']:');
        console.log('  Marketplace:', c.platform);
        console.log('  Título:', c.title);
        console.log('  Video URL:', c.videoUrl);
        console.log('  Confiança:', c.confidence);
        console.log('  Tipo de Origem:', c.sourceType);
        console.log('  Principal:', c.isPrimary);
      });
      if (results.length > 0 && results.some(r => r.videoUrl.includes('.mp4') && r.confidence === 'ALTA')) {
        console.log('=== TESTE DE ACEITAÇÃO: PASS! ===');
      } else {
        console.log('=== TESTE DE ACEITAÇÃO: FAIL! ===');
        process.exit(1);
      }
    }
    run();
  "`;

  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    console.log(output);
    console.log('Tempo decorrido:', Date.now() - t0, 'ms');
  } catch (err) {
    console.error('Erro na execução do teste:', err.stdout || err.message);
    process.exit(1);
  }
}

main();
