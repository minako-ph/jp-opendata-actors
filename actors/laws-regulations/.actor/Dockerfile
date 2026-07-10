# apify push前にローカルで `pnpm --filter @jp-opendata/actor-laws-regulations build` を実行し
# dist/main.js（workspaceパッケージをバンドル済み・apifyのみexternal）を生成しておくこと。
# package.docker.jsonのapifyは完全固定。workspace側のapify更新時に手で同じ値へ揃えること（F-5）。
FROM apify/actor-node:22

COPY package.docker.json ./package.json
RUN npm --quiet set progress=false && npm install --omit=dev --no-package-lock

COPY dist ./dist
COPY README.md ./

CMD ["node", "dist/main.js"]
