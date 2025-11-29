# Documentação da API - United Pool

## Visão Geral

Esta API permite que usuários participem de um pool de mineração para resolver puzzles Bitcoin. O sistema atribui blocos de chaves privadas para cada usuário e verifica as soluções enviadas.

## Configuração Inicial

### 1. Gerar Token de Acesso

**Endpoint:** `POST /api/token/generate`

**Descrição:** Gera um novo token de acesso para o usuário.

**Método:** POST

**Headers:** Nenhum necessário

**Body:** Nenhum necessário

**Resposta de Sucesso (200):**

```json
{
    "token": "seu-token-aqui-12345",
    "bitcoinAddress": "1A3ULXt5m9rQo1QL5rfudjAEGpxodVSQv9",
    "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 2. Obter Estatísticas do Usuário

**Endpoint:** `GET /api/user/stats`

**Descrição:** Retorna as estatísticas do usuário associado ao token.

**Método:** GET

**Headers:**

-   `pool-token`: Seu token de acesso

**Resposta de Sucesso (200):**

```json
{
    "token": "seu-token-aqui-12345",
    "bitcoinAddress": "1A3ULXt5m9rQo1QL5rfudjAEGpxodVSQv9",
    "totalBlocks": 5,
    "completedBlocks": 2,
    "pendingBlocks": 1,
    "totalCredits": 100,
    "availableCredits": 75,
    "activeBlock": {
        "id": 39359,
        "startRange": "0x6280b9fa585e522400",
        "endRange": "0x6280b9fe585e5223ff",
        "assignedAt": "2024-01-01T12:00:00.000Z",
        "expiresAt": "2024-01-01T24:00:00.000Z"
    }
}
```

## Operações de Bloco

### 3. Obter ou Atribuir Novo Bloco

**Endpoint:** `GET /api/block`

**Descrição:** Retorna um bloco ativo existente ou atribui um novo bloco para o usuário.

**Método:** GET

**Headers:**

-   `pool-token`: Seu token de acesso

**Resposta de Sucesso (200):**

```json
{
    "id": 39359,
    "status": 0,
    "range": {
        "start": "0x6280b9fa585e522400",
        "end": "0x6280b9fe585e5223ff"
    },
    "checkwork_addresses": [
        "15VniC13nbt36dWrWirJ2xULudEZsKHY6n",
        "15ssGwttX1D164mE7LFS3UuEuptL4idQbL",
        "1LcJh7GSph6MigGgxnEDFCvmm6SQXo5NLq",
        "1A3ULXt5m9rQo1QL5rfudjAEGpxodVSQv9",
        "186kr4Zr3y6wpFubbgM91rdkKHy5v2dAVq",
        "17c1ExfSLwbesg4Ab8sgRvQ5PE56ay13K8",
        "1HH4q2FMmNNQZcEn7gSx1PHM6bCi1DDRzm",
        "15h6UUYjj7DGrHFEdcwugyp3YBEkSwxxU2",
        "1CmkXXwKraj7Udx6qYN7TJLLDUNWGFUVjR",
        "1QAr3zZh51moodnx2EE5QkJJbq7K9h7dFb"
    ],
    "message": "New block assigned successfully"
}
```

### 4. Enviar Solução do Bloco

**Endpoint:** `POST /api/block/submit`

**Descrição:** Envia as chaves privadas encontradas para verificação.

**Método:** POST

**Headers:**

-   `pool-token`: Seu token de acesso
-   `Content-Type`: application/json

**Body:**

```json
{
    "privateKeys": [
        "0x000000000000000000000000000000000000000000000004388c2b4bf7d206c3",
        "0x000000000000000000000000000000000000000000000004388c2b47d768be72",
        "0x000000000000000000000000000000000000000000000004388c2b55de07d1b2",
        "0x000000000000000000000000000000000000000000000004388c2a6dbcffbea8",
        "0x000000000000000000000000000000000000000000000004388c2a9eeacb6d18",
        "0x000000000000000000000000000000000000000000000004388c2ad8867a6d91",
        "0x000000000000000000000000000000000000000000000004388c2ae80c90c4f3",
        "0x000000000000000000000000000000000000000000000004388c2b05519385c6",
        "0x000000000000000000000000000000000000000000000004388c2b208cda0dcd",
        "0x000000000000000000000000000000000000000000000004388c2b23e5a02d10"
    ]
}
```

**Regras de Envio:**

-   Envie entre **10 e 30** chaves privadas (hex de 64 caracteres; aceita prefixo `0x`).
-   As chaves enviadas devem cobrir os **10** endereços em `checkwork_addresses`; chaves extras são permitidas.
-   Se qualquer chave enviada derivar o endereço do puzzle Bitcoin, ela será registrada de forma segura no sistema.

**Resposta de Sucesso (200):**

```json
{
    "success": true,
    "message": "Block submitted successfully",
    "results": [
        {
            "privateKey": "0x000000000000000000000000000000000000000000000004388c2b4bf7d206c3",
            "address": "15VniC13nbt36dWrWirJ2xULudEZsKHY6n",
            "isValid": true
        }
        // ... resultados para as 10 chaves
    ],
    "creditsEarned": 10,
    "flags": { "puzzleDetected": true }
}
```

## Fluxo Completo do Usuário

### Passo 1: Gerar Token

```bash
curl -X POST http://localhost:3000/api/token/generate
```

### Passo 2: Armazenar Token

Guarde o token recebido em localStorage ou variável de ambiente:

```javascript
localStorage.setItem('pool-token', 'seu-token-aqui-12345');
```

### Passo 3: Obter Estatísticas

```bash
curl -X GET http://localhost:3000/api/user/stats \
  -H "pool-token: seu-token-aqui-12345"
```

### Passo 4: Obter Bloco para Trabalhar

```bash
curl -X GET http://localhost:3000/api/block \
  -H "pool-token: seu-token-aqui-12345"
```

### Passo 5: Processar Bloco

Use o software de mineração para processar o range de chaves privadas:

-   Range inicial: `0x6280b9fa585e522400`
-   Range final: `0x6280b9fe585e5223ff`

### Passo 6: Enviar Resultados

Quando encontrar chaves privadas válidas:

```bash
curl -X POST http://localhost:3000/api/block/submit \
  -H "pool-token: seu-token-aqui-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "privateKeys": [
      "0x000000000000000000000000000000000000000000000004388c2b4bf7d206c3",
      // ... mais 9 chaves
    ]
  }'
```

## Códigos de Erro

-   `400`: Requisição inválida (JSON malformado, dados incorretos)
-   `401`: Token não fornecido ou inválido
-   `405`: Método HTTP não permitido
-   `500`: Erro interno do servidor

## Informações do Puzzle

-   **Bitcoin Address do Puzzle**: `1A3ULXt5m9rQo1QL5rfudjAEGpxodVSQv9`
-   **Range Inicial**: `0x6000000000000000000`
-   **Range Final**: `0x7ffffffffffffffff`

## Notas Importantes

1. Cada bloco contém exatamente 10 endereços de verificação
2. Você deve enviar entre 10 e 30 chaves privadas no POST
3. Cada bloco tem validade de 12 horas
4. Os créditos são ganhos quando chaves válidas são encontradas
5. Use o dashboard web para visualizar seu progresso e gerenciar tokens
