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
        title: '基本概念',
        children: [
          'main/macro-structure.md',
          'main/workloop.md',
          'main/object-structure.md',
        ],
      },
      {
        title: '运行核心',
        children: [
          'main/reconciler-workflow.md',
          'main/bootstrap.md',
          'main/priority.md',
          'main/scheduler.md',
          'main/render.md',
          'main/update.md',
          'main/fibertree-prepare.md',
          'main/fibertree-create.md',
          'main/fibertree-update.md',
          'main/fibertree-commit.md',
          'main/commit.md',
          'main/synthetic-event.md',
        ],
      },
      {
        title: 'Class与Hook',
        children: [
          'main/state-effects.md',
          'main/class-component.md',
          'main/hook.md',
          'main/hook-summary.md',
          'main/hook-state.md',
          'main/hook-effect.md',
        ],
      },
      {
        title: '其他',
        children: ['main/context.md', 'main/error-boundaries.md'],
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
      content:
        'react, react原理, 图解react, react fiber原理, react hook原理, react 合成事件, react 基本包结构',
    },
    {
      name: 'description',
      content:
        '图解React原理系列, 以react核心包结构和运行机制为主线索进行展开. 包括react 基本包结构, react 工作循环, react 启动模式, react fiber原理, react hook原理, react 合成事件等核心内容',
    },
  ],
});
