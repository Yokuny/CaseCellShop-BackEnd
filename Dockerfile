FROM node:22-bullseye-slim AS builder

ENV CI=true

# Fixa o pnpm na mesma versão do host. O pnpm@latest mais novo ativa a política
# minimumReleaseAge por padrão e rejeita pacotes recém-publicados do lockfile.
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile || pnpm install

COPY . .

RUN pnpm run build

FROM node:22-bullseye-slim AS production

ENV CI=true

# Fixa o pnpm na mesma versão do host. O pnpm@latest mais novo ativa a política
# minimumReleaseAge por padrão e rejeita pacotes recém-publicados do lockfile.
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

COPY --from=builder /app/dist ./dist

EXPOSE 8080 9100

CMD ["node", "dist/index.js"]
