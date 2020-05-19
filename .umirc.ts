import { defineConfig } from 'dumi';
import path from 'path';

export default defineConfig({
  title: '图解react',
  mode: 'doc',
  description: '基于react@16.13.1.尽可能跟随react版本的升级,持续更新.',
  locales: [['zh-CN', '中文']],
  // logo: path.resolve(__dirname, './logo.png'),
  logo: 'logo.png',
  copy: ['public'],
  // more config: https://d.umijs.org/config
});
