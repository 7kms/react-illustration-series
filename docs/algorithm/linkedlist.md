---
title: 链表操作
---

# React 算法之链表操作

## 概念

来自 wiki 上的解释: 链表（Linked list）是一种常见的基础数据结构, 是一种线性表, 但是并不会按线性的顺序存储数据, 而是在每一个节点里存到下一个节点的指针(Pointer).由于不必须按顺序存储，链表在插入的时候可以达到 O(1)的复杂度, 但是查找一个节点或者访问特定编号的节点则需要 O(n)的时间.

1. 单向链表: 每个节点包含两个域, 一个信息域和一个指针域. 这个指针指向列表中的下一个节点, 而最后一个节点则指向一个空值.
2. 双向链表: 每个节点有两个连接, 一个指向前一个节点(第一个节点指向空值), 而另一个指向下一个节点(最后一个节点指向空值).
3. 循环链表: 在单向链表的基础上, 首节点和末节点被连接在一起.

![](../../snapshots/linkedlist/summary.png)

## 基本使用

1. 节点插入, 时间复杂度`O(1)`
2. 节点查找, 时间复杂度`O(n)`
3. 节点删除, 时间复杂度`O(1)`
4. 反转链表, 时间复杂度`O(n)`

```js
// 定义Node节点类型
function Node(name) {
  this.name = name;
  this.next = null;
}

// 链表
function LinkedList() {
  this.head = new Node('head');

  // 查找node节点的前一个节点
  this.findPrevious = function(node) {
    let currentNode = this.head;
    while (currentNode && currentNode.next !== node) {
      currentNode = currentNode.next;
    }
    return currentNode;
  };

  // 在node后插入新节点newElement
  this.insert = function(name, node) {
    const newNode = new Node(name);
    newNode.next = node.next;
    node.next = newNode;
  };

  // 删除节点
  this.remove = function(node) {
    const previousNode = this.findPrevious();
    if (previousNode) {
      previousNode.next = node.next;
    }
  };

  // 反转链表
  this.reverse = function() {
    let prev = null;
    let current = this.head;
    while (current) {
      const tempNode = current.next;
      // 重新设置next指针
      current.next = prev;
      // 游标后移
      prev = current;
      current = tempNode;
    }
    // 重新设置head节点
    this.head = current;
  };
}
```

## React 当中的使用场景

在 react 中, 链表的使用非常高频, 主要集中在`fiber`和`hook`对象的属性中.

### fiber

在[react 高频对象](../main/object-structure.md#Fiber)中对`fiber`对象的属性做了说明, 这里列举出 4 个链表属性.

1. `effect`链表(链式队列): 存储有副作用的子节点, 构成该队列的元素是`fiber`对象

   - `fiber.nextEffect`: 单向链表, 指向下一个有副作用的 fiber 节点.
   - `fiber.firstEffect`: 指向副作用链表中的第一个 fiber 节点.
   - `fiber.lastEffect`: 指向副作用链表中的最后一个 fiber 节点.

   ![](../../snapshots/linkedlist/effects.png)

   注意: 此处只表示出链表的结构示意图, 在`fiber 树构造`章节中会对上图的结构进行详细解读.

2. `updateQueue`链表(链式队列): 存储将要更新的状态, 构成该队列的元素是`update`对象

   - `fiber.updateQueue`: 存储`state`更新的队列(链式队列), `class`类型节点的`state`改动之后, 都会创建一个`update`对象添加到这个队列中.

   ![](../../snapshots/data-structure/updatequeue.png)

   注意: 此处只表示出链表的结构示意图, 在`状态组件(class 与 function)`章节中会对上图的结构进行详细解读.

### hook

在[react 高频对象](../main/object-structure.md#Hook)中对`Hook`对象的属性做了说明, `Hook`对象具备`.next`属性, 所以`Hook`对象本身就是链表中的一个节点.

此外`hook.queue`又构成了一个链表, 将`hook`链表与`hook.queue`链表同时表示在图中, 得到的结构如下:

![](../../snapshots/data-structure/fiber-hook.png)

注意: 此处只表示出链表的结构示意图, 在`hook 原理`章节中会对上图的结构进行详细解读.

## 总结

本节主要介绍了`链表`的概念和它在`react`源码中的使用情况. `react`中主要的数据结构都和链表有关, 使用非常高频. 源码中`链表合并`, `环形链表拆解`, `链表遍历`的代码篇幅很多, 所以深入理解链表的使用, 对理解`react原理`大有益处.

## 参考资料

- [链表](https://zh.wikipedia.org/wiki/%E9%93%BE%E8%A1%A8)
