---
title: 优先级管理
---

# React 中的优先级管理

> `React`内部对于`优先级`的管理, 根据功能的不同分为`LanePriority`, `SchedulerPriority`, `ReactPriorityLevel`3 种类型. 本文基于`react@17.0.2`, 梳理源码中的优先级管理体系.

`React`是一个声明式, 高效且灵活的用于构建用户界面的 JavaScript 库. React 团队一直致力于实现高效渲染, 其中有 2 个十分有名的演讲:

1. [2017 年 Lin Clark 的演讲](http://conf2017.reactjs.org/speakers/lin)中介绍了`fiber`架构和`可中断渲染`.
2. [2018 年 Dan 在 JSConf 冰岛的演讲](https://zh-hans.reactjs.org/blog/2018/03/01/sneak-peek-beyond-react-16.html)进一步介绍了时间切片(`time slicing`)和异步渲染(`suspense`)等特性.

演讲中所展示的`可中断渲染`,`时间切片(time slicing)`,`异步渲染(suspense)`等特性, 在源码中得以实现都依赖于`优先级管理`.

在`React@17.0.2`源码中, 一共有`2套优先级体系`和`1套转换体系`, 在深入分析之前, 再次回顾一下([reconciler 运作流程](./reconciler-workflow.md)):

![](../../snapshots/reconciler-workflow/reactfiberworkloop.png)

`React`内部对于`优先级`的管理, 贯穿运作流程的 4 个阶段(从输入到输出), 根据其功能的不同, 可以分为 3 种类型:

1. `fiber`优先级(`LanePriority`): 位于`react-reconciler`包, 也就是[`Lane(车道模型)`](https://github.com/facebook/react/pull/18796).
2. 调度优先级(`SchedulerPriority`): 位于`scheduler`包.
3. 优先级等级(`ReactPriorityLevel`) : 位于`react-reconciler`包中的[`SchedulerWithReactIntegration.js`](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/SchedulerWithReactIntegration.old.js), 负责上述 2 套优先级体系的转换.

## 预备知识

在深入分析 3 种优先级之前, 为了深入理解`LanePriority`, 需要先了解`Lane`, 这是`react@17.0.0`的新特性.

### Lane (车道模型)

> 英文单词`lane`翻译成中文表示"车道, 航道"的意思, 所以很多文章都将`Lanes`模型称为`车道模型`

`Lane`模型的源码在[ReactFiberLane.js](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberLane.js), 源码中大量使用了位运算(有关位运算的讲解, 可以参考[React 算法之位运算](../algorithm/bitfield.md)).

首先引入作者对`Lane`的解释([相应的 pr](https://github.com/facebook/react/pull/18796)), 这里简单概括如下:

1. `Lane`类型被定义为二进制变量, 利用了位掩码的特性, 在频繁运算的时候占用内存少, 计算速度快.
   - `Lane`和`Lanes`就是单数和复数的关系, 代表单个任务的定义为`Lane`, 代表多个任务的定义为`Lanes`
2. `Lane`是对于`expirationTime`的重构, 以前使用`expirationTime`表示的字段, 都改为了`lane`
   ```js
     renderExpirationtime -> renderLanes
     update.expirationTime -> update.lane
     fiber.expirationTime -> fiber.lanes
     fiber.childExpirationTime -> fiber.childLanes
     root.firstPendingTime and root.lastPendingTime -> fiber.pendingLanes
   ```
3. 使用`Lanes`模型相比`expirationTime`模型的优势:

   1. `Lanes`把任务优先级从批量任务中分离出来, 可以更方便的判断单个任务与批量任务的优先级是否重叠.

      ```js
      // 判断: 单task与batchTask的优先级是否重叠
      //1. 通过expirationTime判断
      const isTaskIncludedInBatch = priorityOfTask >= priorityOfBatch;
      //2. 通过Lanes判断
      const isTaskIncludedInBatch = (task & batchOfTasks) !== 0;

      // 当同时处理一组任务, 该组内有多个任务, 且每个任务的优先级不一致
      // 1. 如果通过expirationTime判断. 需要维护一个范围(在Lane重构之前, 源码中就是这样比较的)
      const isTaskIncludedInBatch =
        taskPriority <= highestPriorityInRange &&
        taskPriority >= lowestPriorityInRange;
      //2. 通过Lanes判断
      const isTaskIncludedInBatch = (task & batchOfTasks) !== 0;
      ```

   2. `Lanes`使用单个 32 位二进制变量即可代表多个不同的任务, 也就是说一个变量即可代表一个组(`group`), 如果要在一个 group 中分离出单个 task, 非常容易.

      > 在`expirationTime`模型设计之初, react 体系中还没有[Suspense 异步渲染](https://zh-hans.reactjs.org/docs/concurrent-mode-suspense.html)的概念.
      > 现在有如下场景: 有 3 个任务, 其优先级 `A > B > C`, 正常来讲只需要按照优先级顺序执行就可以了.
      > 但是现在情况变了: A 和 C 任务是`CPU密集型`, 而 B 是`IO密集型`(Suspense 会调用远程 api, 算是 IO 任务), 即 `A(cpu) > B(IO) > C(cpu)`. 此时的需求需要将任务`B`从 group 中分离出来, 先处理 cpu 任务`A和C`.

      ```js
      // 从group中删除或增加task

      //1. 通过expirationTime实现
      // 0) 维护一个链表, 按照单个task的优先级顺序进行插入
      // 1) 删除单个task(从链表中删除一个元素)
      task.prev.next = task.next;
      // 2) 增加单个task(需要对比当前task的优先级, 插入到链表正确的位置上)
      let current = queue;
      while (task.expirationTime >= current.expirationTime) {
        current = current.next;
      }
      task.next = current.next;
      current.next = task;
      // 3) 比较task是否在group中
      const isTaskIncludedInBatch =
        taskPriority <= highestPriorityInRange &&
        taskPriority >= lowestPriorityInRange;

      // 2. 通过Lanes实现
      // 1) 删除单个task
      batchOfTasks &= ~task;
      // 2) 增加单个task
      batchOfTasks |= task;
      // 3) 比较task是否在group中
      const isTaskIncludedInBatch = (task & batchOfTasks) !== 0;
      ```

      通过上述伪代码, 可以看到`Lanes`的优越性, 运用起来代码量少, 简洁高效.

4. `Lanes`是一个不透明的类型, 只能在[`ReactFiberLane.js`](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberLane.js)这个模块中维护. 如果要在其他文件中使用, 只能通过`ReactFiberLane.js`中提供的工具函数来使用.

分析车道模型的源码([`ReactFiberLane.js`](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberLane.js)中), 可以得到如下结论:

1. 可以使用的比特位一共有 31 位(为什么? 可以参考[React 算法之位运算](../algorithm/bitfield.md)中的说明).
2. 共定义了[18 种车道(`Lane/Lanes`)变量](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberLane.js#L74-L103), 每一个变量占有 1 个或多个比特位, 分别定义为`Lane`和`Lanes`类型.
3. 每一种车道(`Lane/Lanes`)都有对应的优先级, 所以源码中定义了 18 种优先级([LanePriority](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberLane.js#L12-L30)).
4. 占有低位比特位的`Lane`变量对应的优先级越高
   - 最高优先级为`SyncLanePriority`对应的车道为`SyncLane = 0b0000000000000000000000000000001`.
   - 最低优先级为`OffscreenLanePriority`对应的车道为`OffscreenLane = 0b1000000000000000000000000000000`.

## 优先级区别和联系

在源码中, 3 种优先级位于不同的 js 文件, 是相互独立的.

注意:

- `LanePriority`和`SchedulerPriority`从命名上看, 它们代表的是`优先级`
- `ReactPriorityLevel`从命名上看, 它代表的是`等级`而不是优先级, 它用于衡量`LanePriority`和`SchedulerPriority`的等级.

### LanePriority

`LanePriority`: 属于`react-reconciler`包, 定义于`ReactFiberLane.js`([见源码](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberLane.js#L46-L70)).

```js
export const SyncLanePriority: LanePriority = 15;
export const SyncBatchedLanePriority: LanePriority = 14;

const InputDiscreteHydrationLanePriority: LanePriority = 13;
export const InputDiscreteLanePriority: LanePriority = 12;

// .....

const OffscreenLanePriority: LanePriority = 1;
export const NoLanePriority: LanePriority = 0;
```

与`fiber`构造过程相关的优先级(如`fiber.updateQueue`,`fiber.lanes`)都使用`LanePriority`.

由于本节重点介绍优先级体系以及它们的转换关系, 关于`Lane(车道模型)`在`fiber树构造`时的具体使用, 在`fiber 树构造`章节详细解读.

### SchedulerPriority

`SchedulerPriority`, 属于`scheduler`包, 定义于`SchedulerPriorities.js`中([见源码](https://github.com/facebook/react/blob/v17.0.2/packages/scheduler/src/SchedulerPriorities.js)).

```js
export const NoPriority = 0;
export const ImmediatePriority = 1;
export const UserBlockingPriority = 2;
export const NormalPriority = 3;
export const LowPriority = 4;
export const IdlePriority = 5;
```

与`scheduler`调度中心相关的优先级使用`SchedulerPriority`.

### ReactPriorityLevel

`reactPriorityLevel`, 属于`react-reconciler`包, 定义于`SchedulerWithReactIntegration.js`中([见源码](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/SchedulerWithReactIntegration.old.js#L65-L71)).

```js
export const ImmediatePriority: ReactPriorityLevel = 99;
export const UserBlockingPriority: ReactPriorityLevel = 98;
export const NormalPriority: ReactPriorityLevel = 97;
export const LowPriority: ReactPriorityLevel = 96;
export const IdlePriority: ReactPriorityLevel = 95;
// NoPriority is the absence of priority. Also React-only.
export const NoPriority: ReactPriorityLevel = 90;
```

`LanePriority`与`SchedulerPriority`通过`ReactPriorityLevel`进行转换

### 转换关系

为了能协同调度中心(`scheduler`包)和 fiber 树构造(`react-reconciler`包)中对优先级的使用, 则需要转换`SchedulerPriority`和`LanePriority`, 转换的桥梁正是`ReactPriorityLevel`.

在[`SchedulerWithReactIntegration.js`中](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/SchedulerWithReactIntegration.old.js#L93-L125), 可以互转`SchedulerPriority` 和 `ReactPriorityLevel`:

```js
// 把 SchedulerPriority 转换成 ReactPriorityLevel
export function getCurrentPriorityLevel(): ReactPriorityLevel {
  switch (Scheduler_getCurrentPriorityLevel()) {
    case Scheduler_ImmediatePriority:
      return ImmediatePriority;
    case Scheduler_UserBlockingPriority:
      return UserBlockingPriority;
    case Scheduler_NormalPriority:
      return NormalPriority;
    case Scheduler_LowPriority:
      return LowPriority;
    case Scheduler_IdlePriority:
      return IdlePriority;
    default:
      invariant(false, 'Unknown priority level.');
  }
}

// 把 ReactPriorityLevel 转换成 SchedulerPriority
function reactPriorityToSchedulerPriority(reactPriorityLevel) {
  switch (reactPriorityLevel) {
    case ImmediatePriority:
      return Scheduler_ImmediatePriority;
    case UserBlockingPriority:
      return Scheduler_UserBlockingPriority;
    case NormalPriority:
      return Scheduler_NormalPriority;
    case LowPriority:
      return Scheduler_LowPriority;
    case IdlePriority:
      return Scheduler_IdlePriority;
    default:
      invariant(false, 'Unknown priority level.');
  }
}
```

在[`ReactFiberLane.js`中](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberLane.js#L196-L247), 可以互转`LanePriority` 和 `ReactPriorityLevel`:

```js
export function schedulerPriorityToLanePriority(
  schedulerPriorityLevel: ReactPriorityLevel,
): LanePriority {
  switch (schedulerPriorityLevel) {
    case ImmediateSchedulerPriority:
      return SyncLanePriority;
    // ... 省略部分代码
    default:
      return NoLanePriority;
  }
}

export function lanePriorityToSchedulerPriority(
  lanePriority: LanePriority,
): ReactPriorityLevel {
  switch (lanePriority) {
    case SyncLanePriority:
    case SyncBatchedLanePriority:
      return ImmediateSchedulerPriority;
    // ... 省略部分代码
    default:
      invariant(
        false,
        'Invalid update priority: %s. This is a bug in React.',
        lanePriority,
      );
  }
}
```

## 优先级使用

通过[reconciler 运作流程](./reconciler-workflow.md)中的归纳, `reconciler`从输入到输出一共经历了 4 个阶段, 在每个阶段中都会涉及到与`优先级`相关的处理. 正是通过`优先级`的灵活运用, `React`实现了`可中断渲染`,`时间切片(time slicing)`,`异步渲染(suspense)`等特性.

在理解了优先级的基本思路之后, 接下来就正式进入 react 源码分析中的硬核部分(`scheduler 调度原理`和`fiber树构造`)

## 总结

本文介绍了 react 源码中有关优先级的部分, 并梳理了 3 种优先级之间的区别和联系. 它们贯穿了[reconciler 运作流程](./reconciler-workflow.md)中的 4 个阶段, 在 react 源码中所占用的代码量比较高, 理解它们的设计思路, 为接下来分析`调度原理`和`fiber构造`打下基础.
