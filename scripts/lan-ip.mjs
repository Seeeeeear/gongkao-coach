/**
 * 打印「手机真正能连上」的地址。
 *
 * 被 允许手机访问.bat 调用，也可以单独跑：node scripts/lan-ip.mjs
 *
 * 为什么要单独做这个：装了 VMware / WSL / VirtualBox 的电脑有好几张虚拟网卡，
 * 它们的地址（如 192.168.19.1）和真实地址混在一起，手机照着打必然连不上。
 * 这里把虚拟网卡过滤掉，并把「像网关的地址」排到最后。
 */
import { networkInterfaces } from 'node:os'

const VIRTUAL_NAME = /vmware|virtualbox|vethernet|hyper-v|wsl|docker|loopback|bluetooth|^tap|^tun|zerotier|tailscale/i

// 192.168.x.1 / 10.x.x.1 / 172.16-31.x.1 这种「网段里的 .1」基本都是虚拟网关
const GATEWAY_LIKE = /^(192\.168|10|172\.(1[6-9]|2\d|3[01]))\.\d+\.1$/

const found = []
for (const [name, list] of Object.entries(networkInterfaces())) {
  if (VIRTUAL_NAME.test(name)) continue
  for (const net of list || []) {
    if (net.family !== 'IPv4' || net.internal) continue
    found.push({ name, address: net.address, suspicious: GATEWAY_LIKE.test(net.address) })
  }
}

const real = found.filter((f) => !f.suspicious)
const maybe = found.filter((f) => f.suspicious)
const ordered = [...real, ...maybe]

if (!ordered.length) {
  console.log('没找到物理网卡地址，请先连接 WiFi 或插入网线')
  process.exit(1)
}

const port = process.env.PORT || 5173
ordered.forEach((f, i) => {
  const tag = i === 0 ? '   <<< 优先试这个' : f.suspicious ? '   （虚拟网卡，手机连不上）' : ''
  console.log(`http://${f.address}:${port}${tag}   [${f.name}]`)
})
