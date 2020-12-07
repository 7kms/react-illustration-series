---
title: 重要数据结构
---

# React 应用中的重要数据结构

在 react 源码中, 使用到了多种数据结构, 为了更好的理解源码, 对于其中的高频数据结构做一下总结.

## 位掩码(bitmask)

> 位掩码, 用二进制位来表示的常量. 多用于表示枚举类型的数据, 优势是能够方便的对枚举常量进行组合与拆分.

高频应用:

- worktag
- lanes

## 栈(stack)

> 栈, 先进后出. 多用于记录 context 状态, 优势是能够精确的控制每一帧.

高频应用:

- context

## 链表(linked list)

高频应用:

- updateQueue
- hook

## 树(tree)

高频应用:

- fiber
