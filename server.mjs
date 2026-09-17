/**
 * 零依赖静态服务器（只用 Node 内置模块）。
 * 用法：node server.mjs   然后浏览器打开 http://localhost:5173
 * 手机调试：同一 WiFi 下访问 http://<电脑局域网IP>:5173
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { networkInterfaces } from 'node:os'

const root = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT || 5173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/babel; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    let filePath = join(root, normalize(urlPath).replace(/^([/\\])+/, ''))

    // 目录 → index.html；找不到 → 回退首页
    let info = await stat(filePath).catch(() => null)
    if (info?.isDirectory()) {
      filePath = join(filePath, 'index.html')
      info = await stat(filePath).catch(() => null)
    }
    if (!info) {
      filePath = join(root, 'index.html')
      info = await stat(filePath).catch(() => null)
    }
    if (!info) {
      res.writeHead(404).end('Not Found')
      return
    }

    const data = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    res.end(data)
  } catch (e) {
    res.writeHead(500).end(String(e))
  }
})

/**
 * 找出「手机真正能连上」的那个地址。
 *
 * 为什么需要这个：装了 VMware / WSL / VirtualBox 的电脑会有好几张虚拟网卡，
 * 它们的地址（常见 192.168.x.1、172.x.x.1）会一起被打印出来，
 * 手机照着打必然连不上 —— 这是最容易踩的坑。
 * 所以这里把虚拟网卡过滤掉，只留真实的物理网卡（WLAN / 以太网）。
 */
function lanAddresses() {
  const VIRTUAL = /vmware|virtualbox|vethernet|hyper-v|wsl|docker|loopback|bluetooth|tap|tun|zerotier|tailscale/i
  const out = []
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (VIRTUAL.test(name)) continue
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) {
        // 192.168.x.1 / 172.x.x.1 这种「网段里的 .1」基本都是虚拟网关，排除
        const isGatewayLike = /^(192\.168|10|172\.(1[6-9]|2\d|3[01]))\.\d+\.1$/.test(net.address)
        out.push({ name, address: net.address, weight: isGatewayLike ? 1 : 0 })
      }
    }
  }
  return out.sort((a, b) => a.weight - b.weight)
}

server.listen(port, '0.0.0.0', () => {
  const lans = lanAddresses()
  console.log(`\n  ✅ 考公做题分析器已启动`)
  console.log(`  ─────────────────────────────────────────────`)
  console.log(`  电脑上用：  http://localhost:${port}`)
  if (lans.length) {
    console.log(`\n  手机上用（手机需和电脑连同一个 WiFi）：`)
    lans.forEach((l, i) => {
      const tag = i === 0 ? '  ← 优先试这个' : ''
      console.log(`     http://${l.address}:${port}${tag}   [${l.name}]`)
    })
    console.log(`\n  打不开的话：`)
    console.log(`   1. 确认手机连的是同一个 WiFi（别连成 5G 访客网络或流量）`)
    console.log(`   2. Windows 防火墙可能拦了，用管理员身份运行项目里的 允许手机访问.bat`)
    console.log(`   3. 路由器开了「AP 隔离」也会连不上，换手机热点试试`)
  } else {
    console.log(`\n  ⚠️ 没找到物理网卡地址，可能没连 WiFi。用手机热点或插网线后再看。`)
  }
  console.log('')
})
