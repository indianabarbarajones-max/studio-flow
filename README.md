# Studio Flow

App de gestão para studios de yoga, em português, com foco na rotina da equipe, no relacionamento e no marketing de conteúdo. A instalação no servidor começa vazia, pronta para cadastrar os dados reais do studio.

## Fluxo de trabalho

- **Visão geral:** tarefas do dia, próximos conteúdos e compromissos; o financeiro continua acessível no menu.
- **Minha rotina:** tarefas, prazos e listas diárias reutilizáveis.
- **Comunicação:** seis modelos de WhatsApp, lembretes de acompanhamento e planejamento semanal de conteúdo. O usuário revisa e envia a mensagem no WhatsApp; o app não dispara mensagens nem publica nas redes.
- **Agenda:** compromissos, aulas e reservas com limite de vagas. Cada compromisso pode ser marcado para sincronizar com o Google Agenda após a conexão da conta.
- **Alunos:** cadastro, planos, renovação e situação. O plano não cria cobranças automaticamente.
- **Financeiro:** lançamentos manuais, confirmação de recebimento/pagamento e exportação CSV. Totais mensais usam o vencimento dos registros quitados; não representam o extrato bancário.
- **Crescimento:** metas com progresso manual.
- **Configurações:** informações reais do studio, contatos, público, tom de voz, serviços, memória compartilhada para a IA e estado das integrações.
- **Assistente:** análise local identificada quando não há chave de API; conexão opcional com a API da OpenAI.

O servidor usa entrada por PIN compartilhado, sessões e limite de tentativas. A mesma base é usada por todos os dispositivos que acessam a instalação publicada. Não há usuários individuais nem permissões diferentes.

## Publicar online

[**Publicar gratuitamente na Cloudflare**](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Findianabarbarajones-max%2FGPT%2Ftree%2Fstudio-flow-free)

A configuração `wrangler.jsonc` usa **Workers Free**, arquivos estáticos e banco SQLite persistente em um Durable Object. Todos os dispositivos usam a mesma base e o PIN é validado no servidor. A hospedagem é gratuita dentro das cotas do plano; a API da OpenAI tem cobrança independente e é opcional.

O botão abre a configuração na sua conta Cloudflare: conecte o GitHub, informe **APP_PIN** como segredo e confirme a publicação. Não é um endereço de app já publicado. Siga o [guia de publicação](docs/DEPLOY.md) para os passos e integrações. A alternativa Render continua disponível, mas exige plano pago com disco.

GitHub Pages sozinho não fornece a API nem o banco compartilhado deste app. Na opção gratuita, a Cloudflare executa essas partes no servidor; os dados não ficam limitados ao navegador.

Para validar a versão Cloudflare no desenvolvimento, com Node 24 e dependências instaladas:

```bash
npm run test:cloudflare
```

Esse comando compila o app, empacota o Worker sem publicá-lo e testa PIN, persistência após reinício, dados compartilhados e navegação no runtime local da Cloudflare. Para desenvolvimento interativo, crie um `.dev.vars` privado a partir de `.dev.vars.example`, preencha um PIN de teste, execute `npm run build` e `npm run dev:cloudflare`. Nunca versione `.dev.vars` ou publique um PIN de teste.

## Executar no desenvolvimento

Requer Node.js 24 ou superior. No ambiente da nuvem, o checkout fica em `/workspace/GPT`; em outra máquina, execute os comandos dentro da pasta do projeto.

```bash
npm ci
npm run build
npm test
npm start
```

No desenvolvimento local, o PIN padrão é `0000`; a variável `APP_PIN` o substitui. Na hospedagem, defina o PIN combinado no campo seguro — produção não tem PIN padrão.

Para editar com recarga automática:

```bash
npm run dev
```

O Vite usa a porta **5173** e encaminha `/api` para o servidor na **3001**. Em produção, o servidor usa a porta fornecida pela hospedagem e recebe requisições pela interface pública. O build de frontend é servido pelo próprio Express.

As variáveis estão documentadas em `.env.example`. Arquivos `.env` não são carregados automaticamente. Use as variáveis do processo ou os campos seguros da hospedagem. **APP_PIN** é obrigatório na produção; **APP_ORIGIN** define o endereço público. No Render, o servidor pode usar **RENDER_EXTERNAL_URL** como origem.

## IA e memória

O ChatGPT Plus e a memória da sua conta ChatGPT não são credenciais utilizáveis pelo app. A API da OpenAI tem chave, faturamento e limites separados. Configure **AI_API_KEY** no servidor; **AI_MODEL** é opcional. Não coloque chaves no HTML, no GitHub ou em conversas.

O contexto compartilhado é preenchido em **Configurações → Memória do studio**, junto com público, tom de voz e serviços. Ele é persistido na base do studio e usado para orientar as consultas à IA. Não há importação automática da memória ou do histórico do ChatGPT.

O servidor usa a API Responses com `store: false`, indicadores do studio e instruções para sugestões práticas. O pedido e o contexto necessário são enviados à OpenAI quando você consulta o assistente. Evite informações pessoais desnecessárias nos campos de contexto e nas mensagens. O assistente oferece sugestões para revisão; não executa cobranças, não publica conteúdo e não envia mensagens aos alunos.

A indicação “IA configurada” significa que existe uma credencial. Uma consulta bem-sucedida é necessária para validar o funcionamento real. Sem chave, o app identifica as respostas como análise local e oferece modelos prontos.

## Google Agenda

A integração exige credencial OAuth de aplicativo Web do Google e autorização da conta que receberá os compromissos. Configure **GOOGLE_CLIENT_ID** e **GOOGLE_CLIENT_SECRET** no servidor, registre o URI de retorno correto no Google e use **Conectar** em Configurações.

A conexão é compartilhada. Somente compromissos marcados para o Google são sincronizados com a agenda principal da conta conectada. O status mostra erros e permite tentar novamente. Reservas de alunos não se tornam convites por e-mail. Consulte as etapas completas no [guia de publicação](docs/DEPLOY.md#conectar-o-google-agenda).

## Dados e limites

- Na Cloudflare, o SQLite fica no armazenamento persistente do Durable Object **STUDIO**. Não remova esse recurso nem altere o identificador fixo `studio` para atualizar o app. Dados do Node/HTML não são migrados automaticamente para a Cloudflare.
- No servidor Node, o SQLite padrão fica em `.data/studio.sqlite`, fora do Git. **DATABASE_PATH** permite usar um disco persistente, como `/var/data/studio.sqlite` no Render.
- Novos bancos começam vazios. Bancos existentes são preservados ao atualizar. Limpeza de dados deve ser uma operação explícita, com cópia de segurança.
- Os tokens Google são criptografados. Na Cloudflare, a chave gerada fica no armazenamento privado persistente; no Node, fica junto ao banco no disco. **INTEGRATION_ENCRYPTION_KEY** permite fornecer uma chave separada no servidor. Preserve a chave e o banco nas cópias privadas.
- Datas operacionais usam `America/Sao_Paulo`; valores monetários estão em reais.
- Não há importação automática das planilhas, integração bancária, cobrança automática, WhatsApp Business API ou publicação automática nas redes.
- A tela do assistente não representa o histórico da conta ChatGPT. A memória do studio é mantida nas configurações do próprio sistema.

## Demonstração em um arquivo

A versão HTML baixável é independente do servidor. Seus dados ficam somente no navegador; não são sincronizados com outros dispositivos. Ela não deve ser confundida com o app online protegido por sessão no servidor.

```bash
npm run build:portable
npm run test:portable
```

O gerador produz `.data/Studio-Flow-Abrir.html`. Chrome e Edge no computador podem abri-lo; visualizadores de anexos em celulares podem não executar o aplicativo. O comportamento do armazenamento varia entre navegadores, e mover o arquivo ou limpar os dados pode remover o acesso aos registros locais.

## Verificações de desenvolvimento

```bash
npm run build        # TypeScript e build de produção
npm test             # API, dados, autenticação e integrações
npm run test:browser # Fluxos reais no navegador
npm run test:cloudflare # Runtime Cloudflare, persistência, autenticação e navegador
```

Os testes usam bancos temporários. Os testes de navegador usam Chromium em `/usr/bin/chromium`; **CHROMIUM_PATH** permite selecionar outro executável. Integrações verificadas com respostas simuladas não comprovam uma conexão real com Google ou OpenAI; valide cada uma na conta correspondente após configurar as credenciais.

React + TypeScript + Vite no frontend; backend Cloudflare Workers + SQLite persistente, ou Express + SQLite nativo do Node. As regras de dados, PIN e integrações são compartilhadas. Fontes e ícones são servidos pelo próprio app.

Cada tarefa da nuvem já possui um ambiente isolado. Use o checkout existente; não crie Git worktrees sem solicitação explícita.
