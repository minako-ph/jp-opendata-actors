# apify push前にローカルで `pnpm --filter @jp-opendata/actor-edinet-filings build` を実行し
# dist/main.js（workspaceパッケージをバンドル済み・apifyのみexternal）を生成しておくこと。
FROM apify/actor-node:22

COPY package.docker.json ./package.json
RUN npm --quiet set progress=false && npm install --omit=dev --no-package-lock

COPY dist ./dist
COPY README.md ./

CMD ["node", "dist/main.js"]
