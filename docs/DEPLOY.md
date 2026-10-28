# Publicar o Studio Flow

O app online usa um servidor e um banco compartilhado. Assim, a equipe vê os mesmos cadastros no computador e no celular. O acesso usa o PIN definido no servidor. Não há usuários individuais ou permissões diferentes.

Os arquivos de publicação estão preparados e a versão Cloudflare foi validada no runtime local, incluindo dois navegadores e persistência após reinício. A criação do serviço e a emissão de uma URL pública ainda exigem acesso à conta da hospedagem. Um link “Deploy” inicia essa configuração; não significa que o app já está publicado.

## Publicar gratuitamente na Cloudflare

[**Abrir a publicação gratuita**](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Findianabarbarajones-max%2FGPT%2Ftree%2Fstudio-flow-free)

1. Abra o botão e crie ou entre na sua conta **Cloudflare**. Mantenha o plano **Workers Free**.
2. Conecte sua conta **GitHub**. O fluxo copia este projeto para um repositório da sua conta; você pode dar a ele o nome **studio-flow**.
3. No campo seguro **APP_PIN**, informe o PIN combinado com a equipe. Esse campo é um segredo do servidor. Não coloque o PIN no nome do projeto, no código ou em uma variável pública do site.
4. Confira os comandos: **build** `npm run build` e **deploy** `npm run deploy`. O projeto inclui `.node-version` para selecionar Node 24. O recurso **STUDIO**, do tipo Durable Object com SQLite, é criado automaticamente pelo arquivo de configuração.
5. Clique em **Deploy/Publicar** e aguarde a conclusão. Abra o endereço terminado em **workers.dev** que a Cloudflare disponibilizar. Entre com o PIN e preencha **Configurações** no app.

O endereço `deploy.workers.cloudflare.com` abre o assistente de publicação. O endereço final do seu app só existe depois que esse assistente conclui o deploy na sua conta. Não é preciso comprar um domínio.

Se preferir conectar o repositório existente, use **Workers & Pages → Create application → Import a repository**, selecione `indianabarbarajones-max/GPT` e a branch **studio-flow-free**. Configure os mesmos comandos de build/deploy e **APP_PIN** como segredo. A `.dev.vars.example` declara o campo esperado sem conter o PIN real.

### O que é gratuito

O app usa arquivos estáticos, Workers e um Durable Object com SQLite, todos disponíveis no plano Workers Free. Segundo a documentação consultada em 28/10/2026, as cotas incluem 100 mil requisições por dia, 5 milhões de linhas lidas por dia, 100 mil linhas escritas por dia e 5 GB de armazenamento SQL total por conta, além dos limites de duração e por objeto. Os limites são compartilhados com outros aplicativos da mesma conta. A configuração não exige contratação do plano pago.

Dentro dessas cotas, a hospedagem custa zero. Ao exceder uma cota do plano gratuito, operações podem ser interrompidas até a renovação do limite; não há garantia de capacidade ilimitada. Confira os limites atuais nas páginas oficiais de [Workers](https://developers.cloudflare.com/workers/platform/pricing/) e [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/).

A API da OpenAI tem cobrança própria e continua opcional. Sem chave, o app mantém o assistente local com modelos e regras identificados. ChatGPT Plus não inclui créditos dessa API. A conexão com Google Agenda também continua dependendo da configuração OAuth e da autorização da conta Google.

### Integrações na Cloudflare

Depois de publicar, abra **Workers & Pages → seu app → Settings → Variables and Secrets**:

- Para IA, adicione **AI_API_KEY** como **Secret**, com uma chave válida da API da OpenAI.
- Para Google, adicione **GOOGLE_CLIENT_ID** e **GOOGLE_CLIENT_SECRET**; guarde o segundo como **Secret**. Siga as etapas de [Google Agenda](#conectar-o-google-agenda) abaixo usando seu endereço `workers.dev`.
- Para mudar o PIN, altere **APP_PIN** como **Secret** e aplique a nova versão. As sessões anteriores serão revogadas.

As alterações precisam ser aplicadas à versão publicada conforme a ação exibida no painel. **APP_ORIGIN** é opcional na Cloudflare: por padrão, o app usa o próprio endereço HTTPS que recebeu. Se definir essa variável, use o endereço completo do app, sem caminhos. Ela restringe o acesso a esse endereço.

O banco e a chave gerada de proteção dos tokens ficam no armazenamento privado persistente de **STUDIO**; não dependem de arquivos temporários. A chave não aparece nas respostas da API ou no navegador. É possível fornecer **INTEGRATION_ENCRYPTION_KEY** como segredo separado, com 32 bytes em hexadecimal ou Base64, antes de conectar o Google; não troque essa chave mantendo tokens antigos.

### Preservar dados e atualizar

Atualize o Worker mantendo o recurso **STUDIO**, a classe **Studio**, a migração SQLite e o identificador fixo `studio`. Excluir o aplicativo, o armazenamento ou recriar a publicação em outro projeto não transporta os cadastros. Uma instalação nova começa vazia; os dados de uma versão Node ou HTML não são importados automaticamente.

Os commits no repositório copiado podem disparar novos builds se a integração contínua estiver habilitada no painel. Preserve o banco nas atualizações e mantenha as opções de recuperação da Cloudflare disponíveis na conta. Não exporte tokens ou cópias completas do banco para o repositório público.

### Publicação por terminal (opcional)

Para quem já usa terminal, a partir da pasta do projeto e com Node 24:

```bash
npm ci
npm run build
npx wrangler login
npx wrangler secret put APP_PIN
npm run deploy
```

O comando de segredo pede o PIN em entrada protegida. Se o Worker ainda não existir, confirme sua criação quando o Wrangler solicitar. Isso não substitui o deploy do código. Não coloque o PIN como argumento de um comando, em `wrangler.jsonc` ou no Git.

## Alternativa: publicar pelo Render (pago)

[Preparar publicação no Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Findianabarbarajones-max%2FGPT&branch=codex%2Fstudio-flow)

1. Entre no Render, conecte sua conta GitHub e autorize o acesso ao repositório `indianabarbarajones-max/GPT`.
2. Confirme que a branch selecionada é **codex/studio-flow** e que o Blueprint usa o arquivo **render.yaml** dessa branch. Se o atalho não selecionar a branch, use **New → Blueprint**, escolha o repositório e selecione essa branch.
3. Confira o serviço **studio-flow**, o plano **Starter** e o disco persistente de **1 GB**, montado em `/var/data`. Essa configuração usa recursos pagos. Revise o preço exibido pelo Render antes de confirmar; este projeto não contratou nenhum plano automaticamente.
4. No campo seguro **APP_PIN**, informe o PIN combinado com a equipe. Não coloque esse valor no GitHub, no código ou no HTML.
5. Confirme a criação do serviço e aguarde o build. O Render disponibilizará a URL HTTPS do app. O servidor usa `RENDER_EXTERNAL_URL` como endereço público; não é necessário copiar essa URL para uma variável no fluxo padrão.
6. Abra essa URL, entre com o PIN e preencha **Configurações**. A instalação nova começa sem alunos, aulas ou lançamentos fictícios. Compartilhe a URL e o PIN com a equipe por um canal apropriado.

O repositório inclui `autoDeploy: false`: novos commits não são publicados automaticamente. Para atualizar, use a ação de deploy manual do Render para a branch configurada. Preserve o disco persistente existente.

O disco é necessário para os cadastros, as sessões e a conexão com o Google Agenda sobreviverem às atualizações. O Blueprint mantém uma instância do servidor usando esse banco SQLite. Não substitua essa arquitetura por hospedagem estática/GitHub Pages: a validação do PIN e o banco são executados no servidor.

## Conectar a IA

A assinatura ChatGPT Plus, suas conversas e sua memória não podem ser usadas diretamente como credencial deste app. A integração usa a API da OpenAI, com cobrança e chave separadas. A memória compartilhada do studio é configurada dentro do próprio app.

1. Na conta da plataforma de API da OpenAI, crie uma chave e confira a configuração de cobrança e os limites que deseja utilizar.
2. Nas configurações de segredos da hospedagem, adicione **AI_API_KEY** com essa chave: **Variables and Secrets** na Cloudflare ou **Environment** no Render. A variável **AI_MODEL** já tem um valor padrão e pode ser ajustada para um modelo disponível nessa conta.
3. Salve e reinicie/republique o serviço conforme a ação oferecida pelo Render.
4. No app, preencha o público, o tom de voz, os serviços e a **Memória do studio** em Configurações. Faça uma consulta no Assistente e confirme que ela retorna como resposta de IA.

“Configurada” indica que o servidor recebeu a credencial. Somente uma resposta bem-sucedida confirma o funcionamento da integração. A chave fica no servidor. Sem chave, o app mantém a análise local identificada como tal.

## Conectar o Google Agenda

A conexão é compartilhada pelo studio. Os compromissos marcados vão para a agenda principal da conta Google que autorizar o app.

1. No Google Cloud Console, crie ou escolha um projeto e habilite a **Google Calendar API**.
2. Configure o consentimento OAuth. Enquanto o aplicativo estiver em modo de teste, adicione a conta Google que fará a conexão à lista de usuários de teste.
3. Crie uma credencial OAuth do tipo **Aplicativo da Web**. Em **URIs de redirecionamento autorizados**, informe exatamente:

   ```text
   https://ENDERECO-DO-SEU-APP/api/integrations/google/callback
   ```

   Substitua `ENDERECO-DO-SEU-APP` pelo endereço HTTPS que o Render forneceu. Não use o endereço do GitHub.

4. Nas configurações da hospedagem (**Variables and Secrets** na Cloudflare ou **Environment** no Render), cadastre **GOOGLE_CLIENT_ID** e **GOOGLE_CLIENT_SECRET**, usando os valores dessa credencial. Guarde o segredo apenas no ambiente do servidor.
5. Reinicie/republique o serviço. Abra **Configurações → Google Agenda → Conectar** no Studio Flow e autorize a conta desejada no Google.
6. Na agenda do Studio Flow, marque **Mostrar no Google Agenda** no compromisso que deseja sincronizar. Confira o estado de sincronização exibido. Se houver falha, corrija a conexão e use a ação de tentar novamente.

O consentimento é necessário e deve ser feito pelo titular da conta Google. O app não acessa a conta apenas por conhecer seu e-mail. O modo de teste do consentimento Google pode limitar o prazo de validade da autorização; siga as exigências do Google para usar a integração de forma contínua fora dos testes.

Se adotar um domínio próprio, atualize **APP_ORIGIN** na hospedagem e o URI autorizado da credencial Google para o mesmo endereço antes de reconectar.

## Dados, acesso e cópias de segurança

O PIN é validado no servidor, com sessão e limite de tentativas. Todos que conhecem esse PIN têm o mesmo acesso aos dados, às configurações e à conexão de agenda. Não há auditoria individual. Para alterar o acesso da equipe, mude **APP_PIN** no ambiente do serviço e reinicie-o.

Na alternativa Node/Render, o disco `/var/data` guarda o banco e a chave usada para criptografar os tokens de integração. As orientações de cópia do disco a seguir se aplicam a essa alternativa; na Cloudflare, use o armazenamento persistente de STUDIO e os recursos de recuperação da plataforma. Mantenha cópias de segurança privadas do banco e da chave, fora do repositório e fora da pasta de arquivos públicos. Restaurar apenas o banco sem a chave pode exigir reconectar o Google.

Para uma cópia manual simples e consistente, pare o serviço, copie a pasta de dados inteira, incluindo eventuais arquivos SQLite `-wal` e `-shm` e a chave de integração, e depois inicie o serviço novamente. Não copie somente o arquivo SQLite enquanto o app estiver escrevendo nele. Use também os recursos de snapshot oferecidos pela hospedagem e teste a restauração antes de depender dessas cópias.

Não remova o disco para atualizar o app. Um banco novo inicia vazio; isso não recupera registros anteriores. As configurações de segredos da hospedagem devem ser preservadas separadamente das cópias de dados.

## Verificação após publicar

- Abra a URL em uma janela anônima: o PIN deve ser solicitado antes de ler os dados.
- Cadastre um registro de teste, abra outro dispositivo e confira o mesmo registro; depois exclua esse teste.
- Reinicie o serviço e confirme que os dados permanecem.
- Faça uma consulta de IA somente depois de configurar a chave.
- Marque um compromisso para o Google, confira a criação e a atualização, e desmarque-o para verificar a remoção do evento associado.

O arquivo HTML baixável é uma demonstração independente. Ele não substitui esta publicação e não compartilha os dados salvos no navegador com o servidor.

## Referências da hospedagem

- [Botão de publicação da Cloudflare](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [Preços e cotas de Workers](https://developers.cloudflare.com/workers/platform/pricing/)
- [SQLite e plano gratuito de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Blueprints do Render](https://render.com/docs/blueprint-spec)
- [Discos persistentes](https://render.com/docs/disks)
- [Variáveis de ambiente](https://render.com/docs/configure-environment-variables)

A configuração gratuita usa Workers com SQLite persistente em Durable Object. O build, o empacotamento sem publicação e os testes no runtime local da Cloudflare foram executados; isso não equivale a um deploy real na sua conta. O Render e o Dockerfile permanecem como alternativas. A construção Docker não foi concluída neste ambiente por falta de conectividade durante a instalação das dependências no contêiner. O build Node e os testes da API foram executados.
