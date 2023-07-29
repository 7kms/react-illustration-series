import { defineConfig } from 'dumi';

const isProd = process.env.NODE_ENV !== 'development';
const ghPagePublicPath = isProd ? '/' : '/';


export default defineConfig({
  publicPath: ghPagePublicPath,
  base: ghPagePublicPath,
  favicons: [`${ghPagePublicPath}km@2x.png`],
  themeConfig: {
    name: '图解React',
    
    logo: `${ghPagePublicPath}logo.png`,
 
    socialLinks:{
      github: 'https://github.com/7kms/react-illustration-series',
    }
  },
  hash: true,
  exportStatic: {},
  ssr: isProd ? {} : false,
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
