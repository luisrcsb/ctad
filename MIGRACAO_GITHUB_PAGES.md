# 📋 Guia: Migrar CTAD do Firebase Hosting para GitHub Pages

## ✅ O que já foi preparado

| Arquivo | Ação |
|---------|------|
| `.github/workflows/deploy.yml` | Workflow de deploy automático no push para `main` |
| `.gitignore` | Ignora pastas pesadas (node_modules, __pycache__, downloads, etc) |
| `index.html` | **Removido** redirect automático `github.io → firebase` |

---

## 🚀 Passo a passo (execute em ordem)

### 1. Criar repositório no GitHub (se ainda não tem)

```bash
# Na pasta do projeto
cd "C:\Users\luisr\OneDrive\Documentos\Projetos\CTAD"

# Inicializar git (se ainda não fez)
git init
git add .
git commit -m "CTAD - migrar para GitHub Pages"

# Criar repo no GitHub (pelo site ou CLI)
# gh repo create krathus-telemetria --public --source=. --remote=origin --push
# OU: crie em github.com/new → clone → copie arquivos → push
```

### 2. Ativar GitHub Pages

1. Vá no repo no GitHub: `Settings` > `Pages` (menu lateral)
2. **Source**: `Deploy from a branch`
3. **Branch**: `main` / `root` (ou `gh-pages` se preferir)
4. **Save** → aguarde 1-2 min → seu site ficará em:
   ```
   https://SEU_USUARIO.github.io/NOME_DO_REPO/
   ```

### 3. Configurar Firebase para aceitar o novo domínio

#### A. Authentication
1. [Firebase Console](https://console.firebase.google.com/project/krathus-telemetria/authentication/settings)
2. **Settings** > **Authorized domains** > **Add domain**
3. Adicione: `SEU_USUARIO.github.io`
4. **Save**

#### B. Storage (opcional - só se usa upload manual pelo site)
- Se usa **só o robô automático**: **nada a fazer** (robô usa SDK Admin, não CORS)
- Se precisa **upload manual pelo navegador**: configure CORS no bucket (veja seção abaixo)

### 4. Push e deploy automático

```bash
git add .
git commit -m "Deploy: GitHub Pages + Firebase config"
git push origin main
```

- Vá na aba **Actions** do GitHub → verá o workflow rodando
- Em ~1 min: site no ar em `https://SEU_USUARIO.github.io/NOME_REPO/`

---

## ⚙️ Configurações importantes

### Domínio personalizado (opcional)

1. No repo: `Settings` > `Pages` > **Custom domain** → `ctad.seudominio.com`
2. No DNS do seu domínio:
   ```
   CNAME  ctad  SEU_USUARIO.github.io.
   ```
3. Marque **Enforce HTTPS** (após certificado emitido)

### Upload manual pelo site (se precisar)

**Problema:** CORS bloqueia `storage.ref().put(file)` de `github.io` para bucket Firebase.

**Solução A - Cloud Function (grátis no Spark):**

```javascript
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.getUploadUrl = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HError('unauthenticated', 'Login necessário');
  
  const bucket = admin.storage().bucket();
  const fileName = `uploads/${context.auth.uid}/${Date.now()}_${data.fileName}`;
  const file = bucket.file(fileName);
  
  const [url] = await file.getSignedUrl({
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 min
    contentType: data.contentType
  });
  
  return { uploadUrl: url, filePath: fileName };
});
```

```javascript
// No frontend (substitua o upload direto):
const { uploadUrl, filePath } = await firebase.functions().httpsCallable('getUploadUrl')({ fileName, contentType });
await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } });
// Depois salve filePath no Realtime Database
```

**Solução B - Só robô automático (recomendado, zero custo, zero código):**
- Desative o botão de upload manual no painel admin
- O robô no PC da pista já sobe tudo 24h/7

---

## 📦 O que NÃO vai para o GitHub (já no .gitignore)

| Pasta/Arquivo | Motivo |
|---------------|--------|
| `upload-robo/node_modules/` | Pesado, regenerável com `npm install` |
| `app-local/__pycache__/` | Bytecode Python |
| `app-local/dist/` | Executáveis .exe (755 MB!) |
| `downloads/*.exe` | Instaladores pesados |
| `upload-robo/serviceAccountKey.json` | **SECRETO!** Nunca comite |

---

## 🔐 Segurança: serviceAccountKey.json

**O robô precisa desta chave para rodar no PC da pista.**

```bash
# No PC da pista (uma vez):
cd upload-robo
# Coloque o serviceAccountKey.json aqui (baixe do Firebase Console > Service Accounts)
npm install
node robo-upload.js
```

**NUNCA** comite este arquivo. O `.gitignore` já bloqueia.

---

## 🔄 Rollback / Voltar atrás

Se der problema:

```bash
# 1. Desative GitHub Pages (Settings > Pages > Source: None)
# 2. No Firebase Console: Hosting > "Gerenciar versões" > promova versão anterior
# 3. Ou: firebase deploy --only hosting (se ainda tiver quota)
```

---

## ✅ Checklist final

- [ ] Repo criado no GitHub
- [ ] GitHub Pages ativado (branch `main`)
- [ ] Domínio `SEU_USUARIO.github.io` adicionado no Firebase Auth
- [ ] `.github/workflows/deploy.yml` commitado
- [ ] `.gitignore` commitado
- [ ] Redirect removido do `index.html`
- [ ] Push feito → Actions rodou → site no ar
- [ ] Testou login, desafios, dossiês, admin
- [ ] (Opcional) Domínio personalizado configurado

---

## 💰 Custo final: **R$ 0,00 / mês**

| Serviço | Plano | Limite | Seu uso estimado |
|---------|-------|--------|------------------|
| GitHub Pages | Free | 1 GB / 100 GB/mês | ~5 MB |
| Firebase Auth | Spark | 10k/mês | ~50 |
| Firebase Database | Spark | 1 GB | ~50 MB |
| Firebase Storage | Spark | 10 GB | ~2 GB (PDFs) |
| Firebase Functions | Spark | 2M/mês | 0 (se não usar upload manual) |

---

## 🆘 Problemas comuns

| Erro | Solução |
|------|---------|
| `404` no refresh (SPA) | GitHub Pages não suporta SPA nativo. Use `cleanUrls: true` no firebase.json (já tem) ou adicione `404.html` = `index.html` |
| Login falha | Verifique **Authorized domains** no Firebase Auth |
| Upload falha (CORS) | Use robô automático OU implemente Cloud Function |
| Site não atualiza | Aguarde 2 min (cache CDN) ou `Ctrl+Shift+R` |

---

**Dúvidas?** Abra issue no repo ou me chame aqui.