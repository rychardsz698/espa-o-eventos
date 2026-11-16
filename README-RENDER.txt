MEU ESPAÇO — PUBLICAÇÃO NO RENDER

Este projeto foi ajustado para iniciar sem PostgreSQL e sem a variável DATABASE_URL.
Os dados são gravados em um arquivo JSON chamado meu-espaco-data.json.

CONFIGURAÇÃO DO RENDER
1. Crie um serviço do tipo Web Service e conecte o repositório GitHub.
2. Runtime: Node.
3. Build Command: npm install
4. Start Command: npm start
5. Não precisa cadastrar DATABASE_URL.

IMPORTANTE SOBRE OS DADOS
O armazenamento em arquivo permite publicar sem configurar banco de dados, mas o disco
padrão do Render é efêmero. Isso significa que cadastros, anúncios, conversas e reservas
podem ser perdidos quando o serviço reiniciar ou houver novo deploy.
Para manter os dados permanentemente, será necessário adicionar um Persistent Disk no
Render e definir DATA_DIR com o caminho de montagem desse disco (por exemplo /var/data).

OBSERVAÇÃO
O protótipo original faz cadastro simples sem senha. Não utilize dados pessoais reais
ou informações sensíveis em produção sem implementar autenticação segura.
