---
title: 重要数据结构
---

# React 应用中的重要数据结构

在 react 源码中, 使用到了多种数据结构, 为了更好的理解源码, 本节对其中的高频数据结构进行归纳, 找出这些数据结构在源码中的使用示例.

## 位掩码(bitmask)

> 位掩码, 用二进制位来表示的常量. 多用于表示枚举类型的数据, 优势是能够方便的对枚举常量进行组合与拆分.

基本操作:

- `&`(按位与)
- `|`(按位或)
- `^`(异或)
- `~`(按位取反)
- `>>`,`<<`(位移)
- `>>>`,`<<<`(无符号位移)

高频应用:

- worktag
- lanes

## 树(tree)

高频应用:

- fiber

## 链表(linked list)

高频应用:

- updateQueue
- hook

## 栈(stack)

> 栈, 先进后出. 多用于记录 context 状态, 优势是能够精确的控制每一帧.

高频应用:

- context

## 二叉堆(binary heap)

在 react 当中, 二叉堆的使用情况和具体的算法细节可参照[React 算法之堆排序](../algorithm/heapsort.md).

此处我们知道在`scheduler`包中, 对`taskQueue`的排序管理, 是通过堆排序的方式进行的(具体源码在[`SchedulerMinHeap.js`](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/SchedulerMinHeap.js#L41-L87)中). 这样可以保证以`O(1)`的时间复杂度, 取到数组顶端的对象(优先级最高的 task)
