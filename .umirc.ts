import { defineConfig } from 'dumi';
import path from 'path';
// more config: https://d.umijs.org/config
export default defineConfig({
  title: '图解React',
  mode: 'site',
  favicon: 'km@2x.png',
  description: '基于react@16.13.1.尽可能跟随react版本的升级,持续更新.',
  locales: [['zh-CN', '中文']],
  logo: '/logo.png',
  menus: {
    '/main': [
      {
        title: '概览',
        children: ['main/guide.md'],
      },
      {
        title: '基本框架',
        children: ['main/01-pkg-structure.md', 'main/data-structure.md'],
      },
      {
        title: '渲染过程',
        children: ['main/bootstrap.md', 'main/render-process.md'],
      },
      {
        title: '更新过程',
        children: ['main/update-process.md'],
      },
      {
        title: '其他',
        children: ['main/synthetic-event.md', 'main/scheduler.md'],
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
});
