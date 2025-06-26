import * as pw from "playwright";
import fetch from "node-fetch";
import { writeFile, readFile } from "fs/promises";
import dotenv from "dotenv";
dotenv.config();

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL!;

const KEYWORDS = [
  "유심사",
  "로밍도깨비",
  "와이파이도시락",
  "eSIM",
  "로밍망",
  "로컬망",
  "말톡",
  "이심이지",
];

const GALLERIES = [
  {
    name: "일본갤",
    url: "https://gall.dcinside.com/mgallery/board/lists/?id=nokanto",
  },
  {
    name: "동남아갤",
    url: "https://gall.dcinside.com/board/lists/?id=travel_asia",
  },
  {
    name: "중국홍콩마카오갤",
    url: "https://gall.dcinside.com/board/lists?id=china",
  },
  {
    name: "방콕파타야갤",
    url: "https://gall.dcinside.com/mgallery/board/lists?id=bangkokpattaya",
  },
];

const statePath = "./dc_checked.json";

async function loadCheckedPosts(): Promise<Record<string, string[]>> {
  try {
    const raw = await readFile(statePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveCheckedPosts(state: Record<string, string[]>) {
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

async function sendToSlack(text: string) {
  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

async function crawlAndNotify() {
  const browser = await pw.chromium.launch({ headless: true });
  const page = await browser.newPage();
  const checked = await loadCheckedPosts();
  const sentSet = new Set<string>(); // 중복 링크 방지용

  for (const { name, url } of GALLERIES) {
    console.log(`[크롤링] ${name} 갤러리`);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const posts = await page.$$eval(".ub-content.us-post", (rows) => {
      return rows.map((row) => {
        const title = row.querySelector(".gall_tit")?.textContent?.trim() || "";
        const link =
          (row.querySelector(".gall_tit > a") as HTMLAnchorElement)?.href || "";
        const no = row.querySelector(".gall_num")?.textContent?.trim() || "";
        return { title, link, no };
      });
    });

    const newPosts = posts.filter((p) => {
      if (!p.no || !p.link) return false;
      const hasKeyword = KEYWORDS.some((k) =>
        p.title.toLowerCase().includes(k.toLowerCase())
      );
      const isNew = !checked[name]?.includes(p.no);
      return hasKeyword && isNew && !sentSet.has(p.no);
    });

    for (const post of newPosts) {
      sentSet.add(post.no);
      await sendToSlack(`📢 *[${name}]* ${post.title}\n🔗 <${post.link}>`);
      console.log(`✅ 슬랙 전송 완료: [${name}] ${post.title}`);
    }

    checked[name] = [
      ...(checked[name] || []),
      ...newPosts.map((p) => p.no),
    ].slice(-50);
  }

  await saveCheckedPosts(checked);
  await browser.close();
}

await crawlAndNotify();

// 깃 올릴때
// git add .
// git commit -m "내용"
// git push origin main
