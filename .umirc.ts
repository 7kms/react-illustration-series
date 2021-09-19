import { defineConfig } from 'dumi';

// More config: https://d.umijs.org/config.
const ghPagePublicPath = '/react-illustration-series/';
export default defineConfig({
  title: '图解React',
  mode: 'site',
  favicon: `${ghPagePublicPath}km@2x.png`,
  description:
    '基于react@17.0.2.尽可能跟随react版本的升级,持续更新. 用大量配图的方式, 致力于将`react原理`表述清楚.',
  locales: [['zh-CN', '中文']],
  logo: `${ghPagePublicPath}logo.png`,
  base: ghPagePublicPath,
  publicPath: ghPagePublicPath,
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
          'main/fibertree-prepare.md',
          'main/fibertree-create.md',
          'main/fibertree-update.md',
          'main/fibertree-commit.md',
        ],
      },
      {
        title: '状态管理',
        children: [
          'main/state-effects.md',
          'main/hook-summary.md',
          'main/hook-state.md',
          'main/hook-effect.md',
          'main/context.md',
        ],
      },
      {
        title: '交互',
        children: ['main/synthetic-event.md'],
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
