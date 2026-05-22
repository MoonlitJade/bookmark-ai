# bookmark-ai

本地优先的智能书签管理工具，双击 `index.html` 即可使用。

## 功能

- 导入浏览器导出的书签 HTML 文件（Chrome / Edge / Brave / Firefox 均支持）
- AI 自动分类、打标签、生成摘要（基于 DeepSeek）
- 拖拽排序、文件夹筛选、搜索过滤
- 数据存储在浏览器本地（IndexedDB），无需后端

## 快速上手

1. 下载 `index.html` 和 `app.js` 放在同一文件夹
2. 双击 `index.html` 打开，或在浏览器中访问 GitHub Pages 链接
3. 导入书签：Chrome → 书签管理器 → 导出书签 → 选择导出的 HTML 文件
4. 点「AI 整理」，输入你的 DeepSeek API Key（免费注册）
5. 整理完成后即可搜索、筛选、浏览

## AI 功能说明

- 首次使用需填入 DeepSeek API Key，Key 仅保存在你的浏览器本地
- 可前往 [platform.deepseek.com](https://platform.deepseek.com) 注册获取 API Key
- 支持批量优化：自动将未分类/无标签的书签补全

## 技术栈

纯前端，零依赖（仅 Dexie.js CDN），无后端。

## 测试
练习GitHub workflow

