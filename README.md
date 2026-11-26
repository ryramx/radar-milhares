# Radar de Milhares

PWA para registrar blocos de milhares e ver estatísticas de frequência por posição (milhar, centena, dezena, unidade) e por bicho.

**Acesse:** https://ryramx.github.io/radar-milhares/

> As estatísticas são só um registro do seu histórico. Cada sorteio é independente: um dígito
> "zerado" ou "atrasado" não tem mais chance de sair. O app não faz previsão.

## Funcionalidades

- **Lançamento rápido** pela barra inferior: aceita `2178 4300`, `2178,4300` ou números colados (`21784300`). Também dá pra colar um resultado copiado de outro lugar: datas, horários e "1º, 2º" são ignorados.
- **Data e horário/extração** em cada bloco, com filtro por período (tudo, 7 ou 30 dias).
- **Editar e remover** blocos (com "Desfazer"), e aviso de bloco duplicado.
- **Painel:** combinações com os dígitos menos frequentes e dígitos zerados por casa.
- **Matriz 4×10:** frequência ou atraso (milhares desde a última vez) de cada dígito por casa.
- **Bichos:** frequência e atraso dos 25 grupos, com as dezenas de cada um.
- **Backup** em JSON, com opção de juntar ou substituir ao restaurar, e lembrete quando passa de 14 dias sem backup.
- **Funciona offline** e pode ser instalado no celular.

## Dados

Tudo fica no `localStorage` do aparelho (chave `radar_milhares_v2`); nada é enviado para servidor.
O app pede armazenamento persistente ao navegador para reduzir o risco de o Safari/iOS apagar os dados,
mas o backup continua sendo a garantia. Dados do formato antigo (`radar_milhares_blocks_v1`) são migrados automaticamente.

## Rodar localmente

É um site estático, sem build. Sirva a pasta com qualquer servidor HTTP (o service worker não funciona via `file://`):

```bash
npx serve .
# ou
python -m http.server 8000
```

## Deploy

Publicado pelo GitHub Pages a partir do branch `main`. Cada push atualiza o site em cerca de um minuto.
O service worker busca primeiro na rede, então quem tem internet recebe a versão nova ao abrir o app;
o cache só é usado offline. Troque `CACHE` em `sw.js` apenas se mudar a lista de arquivos.

## Estrutura

| Arquivo | Conteúdo |
| --- | --- |
| `index.html` | Estrutura das telas |
| `app.js` | Dados, análise, renderização e eventos |
| `style.css` | Estilos |
| `sw.js` | Service worker (offline) |
| `manifest.json` | Manifesto do PWA |
| `icons/` | Ícones do app |
