# 图解 React 原理系列

> 基于[`react@16.13.1`](https://github.com/facebook/react/tree/v16.13.1)(尽可能跟随 react 版本的升级, 持续更新). 用大量配图的方式, 致力于将`react`原理表述清楚.

## 使用指南

1. 本系列以 react 核心包结构和运行机制为主线索进行展开.
2. 开源作品需要社区的净化和参与, 如有表述不清晰或表述错误, 欢迎[issue 勘误](https://github.com/7kms/react-illustration-series/issues). 如果对你有帮助, 请不吝 star.
3. 当下(2020 年 6 月)前端技术圈总体比较浮躁, 各技术平台充斥着不少"标题党". 真正对于技术本身, 不能急于求成, 需要静下心来修炼.
4. 本系列不是面经, 但会列举一些面试题来加深对 react 理解.
5. 本系列所有内容皆为原创, 如需转载, 请注明出处.

## 适用读者

1. 对`react`,`react-dom`开发 web 应用有实践经验.
2. 期望深入理解`react`内在作用原理.

### 主要类容

## 基本概念

1. [基本包结构](./docs/main/pkg-structure.md)
2. [工作循环](./docs/main/workspace.md)

## 运行核心

3. [启动模式](./docs/main/bootstrap.md)
4. [调度机制](./docs/main/scheduler.md)
5. [fiber 构建(新增节点)](./docs/main/render.md)
6. [fiber 构建(更新节点)](./docs/main/update.md)
7. [提交渲染](./docs/main/commit.md)
8. [事件机制](./docs/main/synthetic-event.md)

## 其他

9. [hook 原理](./docs/main/hook.md)
10. `context`机制
11. 异常处理机制
12. `hydration`渲染模式
13. 任务分片机制(`concurrent`模式)
