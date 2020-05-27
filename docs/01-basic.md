# React 基础包结构(web 开发)

> react 工程目录的 packages 下包含 30 几个包(`@16.13.1`版本), 其中与`web`开发相关的核心包共有 5 个

1. react

   > react 基础包, 提供操作 react 对象(`ReactElement`)的全局 api

2. react-dom

   > react 渲染器之一, 是 react 与 web 平台连接的桥梁(可以在浏览器和 nodejs 环境中使用)

3. react-reconciler

   > react 工作空间核心包(综合协调`react-dom`,`react`,`scheduler`各包之间的调用与配合). 管理 react 的输入和输出. 接受输入(`schedulerUpdateOnFiber`), 将输入信息进行处理(涉及调度机制, `fiber`树形结构, `update`队列, 调和算法等), 处理完成之后再次调用渲染器(如`react-dom`, `react-native`等)进行输出

4. scheduler

   > 调度机制的核心实现, 控制`react-reconciler`中的`render`过程, 在`concurrent`模式下实现任务分片

5. legacy-events
   > 原生事件的包装器, 封装合成事件, 提供一套可插拔的插件体系给渲染器(如`react-dom`)使用

橄榄图:

每一个板块代表一个核心包, 红色方块代表入口函数, 绿色方块代表出口函数.

核心的调用脉络就是通过板块间的入口和出口函数连接起来的.

![](../snapshots/core-package.png)
