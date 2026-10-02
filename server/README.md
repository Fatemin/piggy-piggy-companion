# 云端猪（Cloudflare Worker）

ST0014 的服务端：邮箱验证码登录、设备签名、操作重放同步。设计见 [`docs/design/ST0014-online-design.md`](../docs/design/ST0014-online-design.md)。

`server/` 不进 npm 包，也不进桌面 App；它只部署到 Cloudflare。

## 本地运行（不需要任何账号）

```bash
node server/dev.mjs
```

- 地址 `http://127.0.0.1:8787`，数据库默认在内存里（`PIG_CLOUD_DB=<文件>` 可以落盘）。
- 验证码不发邮件，直接打印在终端。
- 测试：`node --test test/server.test.js`

## 上线清单（用户自己操作）

注册账号、生成密钥、改 DNS 都由你来做；下面每一步都不需要把密钥告诉 Claude。

1. **Resend**：注册 → Domains 里添加你的域名 → 按提示在 DNS 加 SPF / DKIM 记录，等它显示 Verified → API Keys 生成一个只有发信权限的 key。
2. **Cloudflare**：注册（免费版即可）→ 本机 `npx wrangler login`。
3. 建数据库并建表：

   ```bash
   npx wrangler d1 create piggy
   ```

   把输出的 `database_id` 填进 `server/wrangler.toml`（从 `wrangler.toml.example` 复制），同时把 `PIG_MAIL_FROM` 改成你域名下的发件地址。

   ```bash
   npx wrangler d1 execute piggy --remote --file server/schema.sql --config server/wrangler.toml
   ```

4. 设置密钥（会提示你粘贴，不会出现在文件里）：

   ```bash
   npx wrangler secret put RESEND_API_KEY --config server/wrangler.toml
   ```

   ```bash
   npx wrangler secret put PIG_SECRET --config server/wrangler.toml
   ```

   `PIG_SECRET` 随便生成一串长随机字符即可（例如 `openssl rand -hex 32` 的输出）。

5. 部署：

   ```bash
   npx wrangler deploy --config server/wrangler.toml
   ```

   得到 `https://piggy-cloud.<你的子域>.workers.dev`。想用自己的域名，在 Cloudflare 后台给 Worker 加 Custom Domain。

6. 在猪的面板里填这个地址登录（P2 完成后）。

## 接口

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| POST | `/v1/auth/code` | — | `{ email, lang }` 发验证码 |
| POST | `/v1/auth/verify` | — | `{ email, code, deviceId, publicKey, deviceName }` 登记设备 |
| GET | `/v1/me` | 签名 | 账号、设备列表 |
| GET | `/v1/sync` | 签名 | 当前的猪 |
| POST | `/v1/sync` | 签名 | `{ ops, snapshot? }` 重放操作，返回权威存档 |
| POST | `/v1/devices/revoke` | 签名 | `{ deviceId }` 吊销设备 |
| GET | `/v1/pen` | 签名 | 我的猪圈：成员的猪、进行中的邀请 |
| POST | `/v1/pen/create` · `/join` · `/leave` | 签名 | 建猪圈 `{ name }` / 用邀请码加入 `{ code }` / 退出 |
| POST | `/v1/pen/invite` · `/accept` · `/cancel` | 签名 | 邀请一起出门 `{ kind, args }` / 接受 `{ inviteId }` / 撤回 |
| GET | `/v1/health` | — | 存活检查 |

签名格式见 [`lib/cloud-proto.js`](../lib/cloud-proto.js)。
