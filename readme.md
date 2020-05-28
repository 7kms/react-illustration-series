# 图解 React 原理系列

> 基于[`react@16.13.1`](https://github.com/facebook/react/tree/v16.13.1)(尽可能跟随 react 版本的升级, 持续更新). 用大量配图的方式, 致力于将`react`原理表述清楚.

## 使用指南

1. 本系列以 react 核心包结构和运行机制为主线索进行展开.
2. 开源作品需要社区的净化, 需要各位同学的共同参与, 如有表述不清晰或表述错误, 欢迎[issue 勘误](https://github.com/7kms/react-illustration-series/issues). 如果对你有帮助, 请不吝 start.
3. 当下(2020 年 6 月)前端技术圈总体比较浮躁, 各技术平台充斥着不少"标题党". 真正对于技术本身, 不能急于求成, 需要静下心来修炼.
4. 本系列不是面经, 但会列举一些面试题来加深对 react 理解.
5. 本系列所有内容皆为原创, 如需转载, 请注明出处.

## 适用读者

1. 对`react`,`react-dom`开发 web 应用有实践经验.
2. 期望深入理解`react`内在作用原理.

### 主要类容

1. [基本包结构](./docs/main/01-basic.md)
2. [启动模式和初始化](./docs/main/02-bootstrap.md)
3. [初次渲染 render 流程](./docs/main/03-render-process.md)
4. [合成事件机制](./docs/main/04-syntheticEvent.md)
5. [调度机制 scheduler](./docs/main/05-scheduler.md)
6. [更新机制](./docs/main/06-update-process.md.md)
7. `context`机制
8. 任务切割机制(concurrent 模式)
