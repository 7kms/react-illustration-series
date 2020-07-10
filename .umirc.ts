import { defineConfig } from 'dumi';
import path from 'path';
// more config: https://d.umijs.org/config
export default defineConfig({
  title: '图解React',
  mode: 'site',
  favicon: '/km@2x.png',
  description:
    '基于react@16.13.1.尽可能跟随react版本的升级,持续更新. 用大量配图的方式, 致力于将`react原理`表述清楚.',
  locales: [['zh-CN', '中文']],
  logo: '/logo.png',
  menus: {
    '/main': [
      {
        title: '概览',
        children: ['main/guide.md'],
      },
      {
        title: '基本概念',
        children: ['main/pkg-structure.md', 'main/workspace.md'],
      },
      {
        title: '运行核心',
        children: [
          'main/bootstrap.md',
          'main/scheduler.md',
          'main/render.md',
          'main/commit.md',
          'main/update.md',
          'main/synthetic-event.md',
        ],
      },
      {
        title: '其他',
        children: [
          'main/hook.md',
          'main/error-boundaries.md',
          'main/context.md',
        ],
      },
    ],
  },
  navs: [
    null,
    {
      title: 'GitHub',
      path: 'https://github.com/7kms/react-illustration-series',
    },
  ],
  hash: true,
  dynamicImport: {},
  ssr: {},
  exportStatic: {},
  metas: [
    {
      name: 'keywords',
      content: 'react, react原理, 图解react, react hooks, hooks原理',
    },
    {
      name: 'description',
      content:
        '图解react系列, 基于react@16.13.1. 包括react fiber构建原理, hooks原理等. 尽可能跟随react版本的升级,持续更新. 用大量配图的方式, 致力于将`react原理`表述清楚.',
    },
  ],
});
