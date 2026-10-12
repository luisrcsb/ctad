# Sistema de Chaves do Campeonato (Championship Manager)

Documento de referência do **sistema de chaves** usado dentro do **Campeonato**
(Championship Manager do CTAD). Descreve o que existe hoje no código, como o
grid é dividido em chaves e como isso (não) afeta a pontuação.

> Última atualização: 12/10/2026 — inclui as correções de ordem de provas e
> mesclagem de nomes (ver seção [Correções recentes](#correções-recentes)).

---

## 1. Conceitos

| Termo | Significado no CTAD |
|-------|---------------------|
| **Campeonato** | Registro em `campeonatos/<chave>`. Guarda configurações, pilotos inscritos e as provas. |
| **Prova / provinha** | Cada relatório (PDF/CSV/txt) enviado para o campeonato. Vira **uma entrada** em `bateriasBancoSeparado` e **uma coluna** na classificação. |
| **Grid** | A grade de largada de uma prova: a lista **ordenada** de pilotos. É gerada para `numeroProvas` provas previstas. |
| **Chave** | Um **corte visual** da grade em blocos (`Chave A`, `Chave B`, ...). Serve para mostrar a divisão de largada; **não** cria coluna nem pontuação própria. |

Pontos importantes:

- As chaves do grid são **derivadas** da ordem da grade e do parâmetro
  `pilotosPorChave`. Elas **não são armazenadas** como dado separado.
- Se a corrida for **realmente disputada em chaves** (ex.: vários relatórios, um
  por chave), o administrador envia **um relatório por chave**. Aí cada chave
  vira uma **prova** (coluna) e, naturalmente, pontua por posição dentro daquela
  chave.

---

## 2. Onde está no código

| O que | Arquivo / função |
|-------|------------------|
| Cálculo da distribuição em chaves | `index.html` → `calcularDistribuicaoChaves()` |
| Ordenação de pilotos por desempenho | `index.html` → `ordenarParticipantesBateria()` |
| Ordem canônica das provas (por `id`) | `index.html` → `ordenarProvasPorId()` |
| Mesclagem de nomes (alias → nome real) | `index.html` → `nomeMesclado()` |
| Deduplicação de nomes na grade | `index.html` → `nomesUnicosSemVazios()` |
| Renderização do grid por chave | `index.html` → `atualizarInterfacePainelZRound()` (bloco de grids) |
| Classificação / pontuação | `index.html` → `calcularClassificacaoBancoSeparado()` |
| UI de configuração (`zround-pilotos-chave`) | `campeonatos.js` (salvar) e `index.html` (carregar) |

---

## 3. Configuração do campeonato

Campos relevantes em `campeonato.configuracoes`:

| Campo | Padrão | Para que serve |
|-------|--------|----------------|
| `numeroProvas` | `4` | Quantas grades/rodadas o painel deve pré-visualizar. |
| `pilotosPorChave` | `10` | Tamanho **máximo** de cada chave ao dividir a grade. |
| `pilotosPorProva` | — | **Nome antigo** de `pilotosPorChave`; mantido como fallback para campeonatos criados antes da renomeação. |
| `inverterSegundaBateria` | `true` | Inverte a grade a partir da 2ª prova (largada invertida) usando o resultado da prova anterior. |
| `usaGridTreino` | `false` | Se ligado, a grade base inicial vem do treino (`gridTreinoDados`) em vez dos inscritos. |
| `pontuacaoTabela` | `[25,18,15,12,10,8,6,4,2,1]` | Pontos por posição (1º = 25, 2º = 18, ...). Posições além da tabela valem 0. |

Leitura do parâmetro (com fallback):

```js
let maxPilotosPorChave =
    camp.configuracoes?.pilotosPorChave ??
    camp.configuracoes?.pilotosPorProva ??
    10;
```

---

## 4. Como a grade vira chaves

Para cada prova prevista (`g = 0 ... numeroProvas - 1`):

1. **Monta a lista de pilotos** da grade:
   - `g === 0` → base inicial = `gridTreinoDados` (se `usaGridTreino`) **ou** os
     pilotos inscritos **ou** os pilotos da 1ª prova já registrada.
   - `g > 0` → pega o resultado da prova anterior, reordena por desempenho
     (`ordenarParticipantesBateria`) e, se `inverterSegundaBateria`, inverte a
     lista (largada invertida).
2. Aplica **mesclagem de nomes** e **remove vazios/duplicados**
   (`nomeMesclado` + `nomesUnicosSemVazios`).
3. Chama `calcularDistribuicaoChaves(total, maxPilotosPorChave)`.
4. Desenha a tabela:
   - **1 chave** → tabela única (comportamento de sempre).
   - **2+ chaves** → `🔑 Chave A (n pilotos)`, `🔑 Chave B (n pilotos)`, ... A
     **Chave A é sempre a primeira da ordem** (os mais rápidos/líderes).

A ordem de desempenho (usada para montar a grade) é:

1. **Mais voltas válidas** vence.
2. Empate → **menor tempo total** das voltas válidas.
3. Empate → **melhor volta**.

(volta inválida = `null`, negativa ou `0`; são descartadas do cálculo.)

---

## 5. Algoritmo de distribuição (`calcularDistribuicaoChaves`)

Entrada: `totalPilotos`, `maxPorChave` (padrão 10).

```
max = max(1, maxPorChave)
se total <= 0        -> []
se total <= max      -> [total]                      // chave única
numChaves = ceil(total / max)
base  = floor(total / numChaves)
resto = total - base * numChaves
dist  = [base, base, ..., base]                       // numChaves posições
// Distribui o "resto" a partir da 1ª chave, respeitando o teto "max":
i = 0
enquanto resto > 0 e i < numChaves:
    espaco = max - dist[i]
    adicionar = min(resto, espaco)
    dist[i] += adicionar
    resto -= adicionar
    i++
// Regra "ninguém corre sozinho":
enquanto len(dist) > 1 e dist[-1] == 1:
    ultimo = dist.pop()
    dist[-1] += ultimo
retorna dist
```

### Regra: ninguém corre sozinho

Se a **última** chave ficar com **1 único piloto**, ela é absorvida pela chave
anterior. Isso pode fazer a chave anterior **ultrapassar** o máximo configurado
(intencional — é melhor uma chave um pouco maior do que alguém correndo sozinho).

### Exemplos (calculados a partir do código atual)

| Pilotos | Máx/chave | Distribuição | Chaves |
|--------:|----------:|--------------|--------|
| 25 | 10 | `[9, 8, 8]` | A=9, B=8, C=8 |
| 21 | 10 | `[7, 7, 7]` | A=7, B=7, C=7 |
| 12 | 10 | `[6, 6]` | A=6, B=6 |
| 10 | 10 | `[10]` | única |
| 5 | 2 | `[2, 3]` | A=2, B=3 |
| 7 | 2 | `[2, 2, 3]` | A=2, B=2, C=3 |
| 3 | 2 | `[3]` | absorção (A=3, passa do máx) |

---

## 6. Classificação (pontuação) e a relação com as chaves

`calcularClassificacaoBancoSeparado(camp)`:

1. Ordena as provas por `id` de cadastro (`ordenarProvasPorId`).
2. Para **cada prova** (coluna), pega os participantes com voltas válidas,
   **reordena por desempenho** (`ordenarParticipantesBateria`) — ou seja, ignora
   o campo `pos` do relatório e usa as voltas reais.
3. Dá a cada piloto os pontos da posição na tabela `pontuacaoTabela`
   (1º = 25, 2º = 18, ...).
4. Aplica **mesclagem de nomes** (`nomeMesclado`) para somar apelidos/aliases no
   mesmo piloto.
5. Soma os pontos por piloto em todas as provas e ordena por total.

> **As chaves do grid NÃO entram na pontuação.** A pontuação é **por prova
> (coluna)**, na ordem de **dentro** daquela prova. O corte em `Chave A/B/C` é
> apenas visual, para a largada.

Consequência prática:

- Campeonato com **uma chave única** → tudo normal (uma prova = uma coluna).
- Corrida **disputada em chaves separadas** → envie **um relatório por chave**;
  cada um vira uma coluna e pontua por posição dentro da chave. Como as colunas
  são somadas, o resultado final soma os pontos de cada chave em que o piloto
  correu.

---

## 7. Correções recentes

Ajustes que alinharam o grid com a classificação (antes podiam divergir):

1. **Ordem canônica das provas por `id`** (`ordenarProvasPorId`): antes o grid
   usava a ordem de inserção entregue pelo Firebase e a classificação usava
   `id`. Ao importar vários arquivos em lote, a grade podia pegar a prova
   "anterior" errada. Agora grid, lista de provas e classificação usam a mesma
   ordem (desempate por `bateriaKey` para ser determinístico).
2. **Mesclagem de nomes também na grade** (`nomeMesclado`): apelidos/aliases
   eram mesclados só na classificação; agora valem também no grid.
3. **Deduplicação** (`nomesUnicosSemVazios`): remove pilotos vazios e duplicados
   da grade (necessário depois de mesclar dois nomes no mesmo piloto).
4. **`js/campeonatos.js` sincronizado** com a implementação canônica (o módulo
   em `js/` ainda não está ligado ao site; era um clone divergente).

---

## 8. Limitações e evolução possível

- **Pontuação por chave (ex.: "1º de cada chave pontua igual")**: não existe
  hoje. A pontuação é por relatório/prova. Implementar exigiria marcar quais
  provas formam uma mesma rodada/chave (hoje não há esse vínculo no dado).
- **Final / mata-mata (semifinal, final)**: não existe sistema de eliminatória;
  a classificação é sempre por soma de pontos.
- **Classificação cruzada entre chaves**: não há; cada coluna pontua de forma
  independente.

---

## 9. Referência rápida de chamadas

```js
// Distribuição de pilotos por chave
calcularDistribuicaoChaves(21, 10);   // -> [7, 7, 7]

// Ordena pilotos de uma prova por desempenho real (voltas)
ordenarParticipantesBateria(dados);   // -> array ordenado

// Ordem estável das provas de um campeonato
ordenarProvasPorId(camp.bateriasBancoSeparado);  // -> [chaves em ordem]

// Nome final do piloto (com mesclagem/alias)
nomeMesclado("Ze");                   // -> "José" (se houver mesclagem)

// Classificação completa (ranking por pontos)
calcularClassificacaoBancoSeparado(camp);  // -> [{ piloto, provas, pontos }]
```
