# 图解 React 原理系列

> `react`原理, 基于[`react@17.0.1`](https://github.com/facebook/react/tree/v16.13.1)(尽可能跟随 react 版本的升级, 持续更新). 用大量配图的方式, 致力于将`react`原理表述清楚.

## 使用指南

1. 本系列以 react 核心包结构和运行机制为主线索进行展开. 包括`react 基本包结构`, `react 工作循环`, `react 启动模式`, `react fiber原理`, `react hook原理`, `react 合成事件`等核心内容.
2. 开源作品需要社区的净化和参与, 如有表述不清晰或表述错误, 欢迎[issue 勘误](https://github.com/7kms/react-illustration-series/issues). 如果对你有帮助, 请不吝 star.
3. 本系列最初写作于 2020 年 6 月(当时稳定版本是 v16.13.1), 随着 react 官方的升级, 本 repo 会将主要版本的文章保存在以版本号命名的分支中, `master`分支将保持最新
4. 当下前端技术圈总体比较浮躁, 各技术平台充斥着不少"标题党". 真正对于技术本身, 不能急于求成, 需要静下心来修炼.
5. 本系列不是面经, 但会列举一些面试题来加深对 react 理解.
6. 本系列所有内容皆为原创, 如需转载, 请注明出处.

## 适用读者

1. 对`react`,`react-dom`开发 web 应用有实践经验.
2. 期望深入理解`react`内在作用原理.

## 主要类容

### 基本概念

1. 基本包结构
2. 工作循环

### 运行核心

3. 启动模式
4. 调度机制
5. fiber 树构建(创建)
6. fiber 树构建(更新)
7. 提交渲染
8. 事件机制

### 其他

9. hook 原理
10. context 机制

### 历史版本

- [基于 v16.13.1 版本的分析](https://github.com/7kms/react-illustration-series/tree/v16.13.1)
- [基于 v17.0.1 版本的分析](https://github.com/7kms/react-illustration-series/tree/v17.0.1)
