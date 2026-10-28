# Seu primeiro dia no Studio Flow

A versão de servidor começa vazia. Após a publicação, todos os dispositivos acessam o mesmo endereço, entram com o PIN da equipe e compartilham os cadastros.

## Configure seu studio

Abra **Configurações** e preencha nome, responsável, contatos, endereço e Instagram. Na parte de marketing, descreva os serviços, o público e o tom de voz da marca. Clique em **Salvar configurações**.

Em **Memória do studio**, registre decisões, preferências e informações que o assistente deve considerar: prioridades do mês, frequência das publicações, dúvidas recorrentes e orientações de atendimento. Essa memória pertence ao app; não é uma conexão automática com a memória do ChatGPT.

## Organize a rotina

1. Abra **Minha rotina** e use **Preparar rotina de hoje**.
2. Revise agenda, conteúdo do dia e acompanhamento de interessados.
3. Acrescente tarefas específicas com um prazo.
4. Marque cada tarefa conforme terminar. A preparação do dia evita repetir tarefas padrão já existentes na mesma data.

A **Visão geral** destaca as tarefas, os conteúdos e os compromissos. O Financeiro continua disponível no menu e como resumo secundário.

## Cuide das conversas

Em **Marketing e conteúdo → Mensagens prontas**, escolha o momento: primeiro contato, confirmação de experimental, pós-aula, retomada, renovação ou indicação. Selecione um aluno ou preencha o contato, revise a mensagem e copie ou abra o rascunho no WhatsApp. Você confirma o envio no WhatsApp.

Use **Lembrar de retornar** para colocar o acompanhamento na rotina.

## Prepare os conteúdos da semana

Em **Marketing e conteúdo → Calendário de conteúdo**, escolha a data inicial e use **Planejar 3 conteúdos**. O app prepara rascunhos para acolher iniciantes, mostrar o studio e convidar para uma conversa. Personalize com a voz do negócio. As etapas ideia, rascunho, programado e publicado organizam o trabalho; não publicam automaticamente nas redes.

## Use a agenda

Cadastre a aula ou o compromisso com dia, horário, duração e responsável. As inscrições respeitam o limite de vagas. Com a integração Google configurada e autorizada em **Configurações**, marque **Mostrar no Google Agenda** somente nos compromissos desejados. Confira o status de sincronização. Se falhar, o cadastro local permanece e você pode tentar novamente.

Desmarcar um compromisso solicita a remoção do evento correspondente no Google. Desconectar a conta pausa novas sincronizações e mantém os eventos já criados no Google.

## Consulte o assistente

Peça ajuda para organizar o dia, planejar conteúdos ou preparar uma mensagem. A IA generativa usa a API da OpenAI, com chave e cobrança próprias; ChatGPT Plus não inclui essa integração. Sem chave, o modo local oferece regras e modelos identificados. Uma credencial configurada ainda pode precisar ser corrigida se a API a recusar.

## Publicação e versões

O código no GitHub e a versão HTML baixável não são uma publicação online do servidor. O HTML guarda dados apenas naquele navegador, sem sessão PIN de servidor nem sincronização. Para a equipe usar o app em vários dispositivos, use a [publicação gratuita na Cloudflare](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Findianabarbarajones-max%2FGPT%2Ftree%2Fstudio-flow-free), dentro das cotas do plano Workers Free. O [guia de publicação](docs/DEPLOY.md) explica os passos, incluindo o PIN e o banco persistente.

A publicação, a autorização Google e a configuração de uma chave de API válida exigem as contas e confirmações dos respectivos titulares. O guia indica os passos; nenhum plano de hospedagem foi contratado automaticamente.
