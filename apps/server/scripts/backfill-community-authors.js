/**
 * 回填社群演示动态/留言的 author_id。
 *
 * 背景：社群演示内容播种时只写了作者快照（author_name / author_avatar），
 * 没写 author_id。接口把 author.id 原样返回 null，于是小程序点头像拿不到
 * userId，成员名片打不开——「点发帖人/留言人头像看名片」这条需求在演示
 * 数据上失效。
 *
 * 安全边界：
 * - 只按 author_name 精确匹配 users.nickname，命中唯一用户才回填；
 * - 只写 community_posts.author_id / community_comments.author_id 两列；
 * - 只更新 author_id IS NULL 的行，不改任何内容、计数、状态与时间戳；
 * - 不执行 DDL，不碰资金、结算与台账表。
 *
 * 用法：
 *   node scripts/backfill-community-authors.js dump     # 只看现状
 *   node scripts/backfill-community-authors.js apply    # 备份后回填
 *   node scripts/backfill-community-authors.js restore <file>
 */
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const BACKUP_DIR = path.join(__dirname, '..', 'prisma', 'backups')

async function collect() {
  const posts = await prisma.communityPost.findMany({
    select: { id: true, communityId: true, authorId: true, authorName: true },
  })
  const comments = await prisma.communityComment.findMany({
    select: { id: true, postId: true, authorId: true, authorName: true },
  })
  return { posts, comments }
}

async function resolveUsers(names) {
  const users = await prisma.user.findMany({
    where: { nickname: { in: names } },
    select: { id: true, nickname: true },
  })
  const byName = new Map()
  for (const user of users) {
    // 同名多账号时不猜，留空由人工确认，避免把留言挂到错误的人身上
    byName.set(user.nickname, byName.has(user.nickname) ? null : user.id)
  }
  return byName
}

async function dump() {
  const { posts, comments } = await collect()
  const missingPosts = posts.filter((p) => !p.authorId)
  const missingComments = comments.filter((c) => !c.authorId)
  const names = [...new Set([...missingPosts, ...missingComments].map((r) => r.authorName))]
  const byName = await resolveUsers(names)
  console.log(`动态 ${posts.length} 条，其中缺 author_id ${missingPosts.length} 条`)
  console.log(`留言 ${comments.length} 条，其中缺 author_id ${missingComments.length} 条`)
  for (const name of names) {
    const hit = byName.get(name)
    console.log(`  ${name} -> ${hit || '未匹配到唯一用户，跳过'}`)
  }
}

async function apply() {
  const { posts, comments } = await collect()
  const missingPosts = posts.filter((p) => !p.authorId)
  const missingComments = comments.filter((c) => !c.authorId)
  if (!missingPosts.length && !missingComments.length) {
    console.log('没有需要回填的行')
    return
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
  const file = path.join(BACKUP_DIR, `community-authors-${stamp}.json`)
  fs.writeFileSync(file, JSON.stringify({ posts: missingPosts, comments: missingComments }, null, 2))
  console.log(`备份：${file}`)

  const names = [...new Set([...missingPosts, ...missingComments].map((r) => r.authorName))]
  const byName = await resolveUsers(names)

  let postDone = 0
  for (const post of missingPosts) {
    const userId = byName.get(post.authorName)
    if (!userId) continue
    await prisma.communityPost.update({ where: { id: post.id }, data: { authorId: userId } })
    postDone++
  }
  let commentDone = 0
  for (const comment of missingComments) {
    const userId = byName.get(comment.authorName)
    if (!userId) continue
    await prisma.communityComment.update({ where: { id: comment.id }, data: { authorId: userId } })
    commentDone++
  }
  console.log(`回填动态 ${postDone}/${missingPosts.length} 条，留言 ${commentDone}/${missingComments.length} 条`)
}

async function restore(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const post of data.posts || []) {
    await prisma.communityPost.update({ where: { id: post.id }, data: { authorId: post.authorId } })
  }
  for (const comment of data.comments || []) {
    await prisma.communityComment.update({ where: { id: comment.id }, data: { authorId: comment.authorId } })
  }
  console.log(`已回滚 ${(data.posts || []).length} 条动态、${(data.comments || []).length} 条留言`)
}

async function main() {
  const [mode, arg] = process.argv.slice(2)
  if (mode === 'apply') await apply()
  else if (mode === 'restore') {
    if (!arg) throw new Error('restore 需要备份文件路径')
    await restore(arg)
  } else await dump()
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
