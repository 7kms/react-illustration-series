---
title: 工作循环
---

## 两大循环

在 react 主干逻辑中, 有两个主循环, 分别是`任务调度循环`和`fiber构建循环`.

在前文([react 基本包结构](./pkg-structure.md))中, 介绍了 5 个主要包之间调用关系. 本节讨论的两个主循环分别在`scheduler`和`react-reconciler`包中:

![](../../snapshots/workloop.png)

两大工作循环具体对应的 js 文件:

1. `任务调度循环`: [`Scheduler.js`](https://github.com/facebook/react/blob/v16.13.1/packages/scheduler/src/Scheduler.js), 控制所有任务的调度.

2. `fiber构建循环`: [`ReactFiberWorkLoop.js`](https://github.com/facebook/react/blob/v16.13.1/packages/react-reconciler/src/ReactFiberWorkLoop.js), 控制 fiber 树构建和渲染.

这两个文件不同于其他闭包(运行时就是闭包), 其中定义的全局变量, 不仅是该作用域的私有变量, 更用于`控制react应用的执行过程`.

## 主干逻辑

**从工作循可以理解 react 应用主干逻辑**(只是主干逻辑, 细节在各章节中展开):

1. 页面的每一次变动(初次 render 和后续 update), 都可以看成是一个`更新任务(task)`(节点的新增,修改,删除).
2. 调度中心`scheduler`是 react 应用的实际控制者, 通过`任务调度循环`来调度`task`.
3. `task`的实现逻辑被封装到`react-reconciler`包中, 核心环节有 2:
   - `fiber构建循环`是`task`的实现环节之一, 循环完成之后会构建出最新的 fiber 树.
   - `commitRoot`是`task`的实现环节之二, 把最新的 fiber 树最终渲染到页面上, `task`完成.
