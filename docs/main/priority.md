---
title: 优先级管理
---

# React 中的优先级管理

`React`是一个声明式, 高效且灵活的用于构建用户界面的 JavaScript 库. React 团队一直致力于实现高效渲染, 其中有 2 个十分有名的演讲:

1. [2017 年 Lin Clark 的演讲](http://conf2017.reactjs.org/speakers/lin)中介绍了`fiber`架构和`可中断渲染`.
2. [2018 年 Dan 在 JSConf 冰岛的演讲](https://zh-hans.reactjs.org/blog/2018/03/01/sneak-peek-beyond-react-16.html)进一步介绍了时间切片(`time slicing`)和异步渲染(`suspense`)等特性.

演讲中所展示的`可中断渲染`,`时间切片(time slicing)`,`异步渲染(suspense)`等特性, 在源码中得以实现都依赖于`优先级管理`.

## 预备知识

在深入分析之前, 再次回顾一下([reconciler 运作流程](./reconciler-workflow.md)):

![](../../snapshots/reconciler-workflow/reactfiberworkloop.png)

react 内部对于`优先级`的管理, 根据其源码所在不同的包, 可以分为 2 种类型:

1. 渲染优先级: 位于`react-reconciler`包, 也就是[`Lane(车道模型)`](https://github.com/facebook/react/pull/18796).
2. 调度优先级: 位于`scheduler`包.

### Lane (车道模型)

> 英文单词`lane`翻译成中文表示"车道, 航道"的意思, 所以很多文章都将`Lanes`模型称为`车道模型`

`Lane`模型的源码在[ReactFiberLane.js](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberLane.js), 源码中大量使用了位运算(有关位运算的讲解, 可以参考[React 算法之位运算](../algorithm/bitfiled.md)).

首先引入作者对`Lane`的解释([相应的 pr](https://github.com/facebook/react/pull/18796)), 这里简单概括如下:

1. `Lane`类型被定义为二进制变量, 利用了位掩码的特性, 在频繁的时候占用内存少, 计算速度快.
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
      > 但是现在情况变了: A 和 C 任务是`CPU密集型`, 而 B 是`IO密集型`(Suspense 会调用远程 api, 算是 IO 任务), 即 `A(cup) > B(IO) > C(cpu)`. 此时的需求需要将任务`B`从 group 中分离出来, 先处理 cpu 任务`A和C`.
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
      ```


          // 2. 通过Lanes实现
          // 1) 删除单个task
            batchOfTasks &= ~task
          // 2) 增加单个task
            batchOfTasks |= task
          // 3) 比较task是否在group中
           const isTaskIncludedInBatch = (task & batchOfTasks) !== 0;
        ```
        通过上述伪代码, 可以看到`Lanes`的优越性, 运用起来代码量少, 简洁高效.

4. `Lanes`是一个不透明的类型, 只能在[`ReactFiberLane.js`](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberLane.js)这个模块中维护. 如果要在其他文件中使用, 只能通过`ReactFiberLane.js`中提供的工具函数来使用.

分析车道模型的源码([`ReactFiberLane.js`](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberLane.js)中), 可以得到如下结论:

1. 可以使用的比特位一共有 31 位(为什么? 可以参考[React 算法之位运算](../algorithm/bitfiled.md)中的说明).
2. 共定义了[18 种车道(`Lane/Lanes`)变量](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberLane.js#L74-L103), 每一个变量占有 1 个或多个比特位, 分别定义为`Lane`和`Lanes`类型.
3. 每一种车道(`Lane/Lanes`)都有对应的优先级, 所以源码中定义了 18 种优先级([LanePriority](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberLane.js#L12-L30)).
4. 占有低位比特位的`Lane`变量对应的优先级越高
   - 最高优先级为`SyncLanePriority`对应的车道为`SyncLane = 0b0000000000000000000000000000001`.
   - 最高优先级为`OffscreenLanePriority`对应的车道为`OffscreenLane = 0b1000000000000000000000000000000`.

## 优先级使用

现在正式进入正题, 把`优先级`机制对应到`reconciler 运作流程`中, 那么它创建于第一步(`输入`), 贯穿于整个输入到输出的过程. 后文将以`reconciler 运作流程`的 4 个阶段为时间线, 逐一分析每一个步骤中关于`优先级`的运用情况.

### 输入阶段

通过[启动过程](./bootstrap.md)一文的解读, 我们知道`react`应用初始化之后, 会经过`updateContainer`函数, 最后进入`scheduleUpdateOnFiber`函数.

注意`scheduleUpdateOnFiber(fiber: Fiber,lane: Lane,eventTime: number)`函数签名中的第 2 个参数`lane: Lane`就是贯穿全局的优先级, 它是`Lane`类型, 实际上是一个二级制变量.

再往前推一步, `lane`实际上是在[`updateContainer`](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberReconciler.old.js#L250-L321)函数中首次创建(优先级的源头所在).

```js
// ... 省略部分无关代码
export function updateContainer(
  element: ReactNodeList,
  container: OpaqueRoot,
  parentComponent: ?React$Component<any, any>,
  callback: ?Function,
): Lane {
  const current = container.current;
  // 1. 获取当前时间戳
  const eventTime = requestEventTime();
  // 2. 创建一个优先级变量(车道模型)
  const lane = requestUpdateLane(current);

  // 3. 根据车道优先级, 创建update对象, 并加入fiber.updateQueue.pending队列
  const update = createUpdate(eventTime, lane);
  update.payload = { element };
  enqueueUpdate(current, update);

  // 4. 正式进入`输入`环节
  scheduleUpdateOnFiber(current, lane, eventTime);

  return lane;
}
```

首先分析`requestEventTime()`函数, 顺着调用栈依次跟踪, 最后调用了`scheduler`包中的[`getCurrentTime()`](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/forks/SchedulerHostConfig.default.js#L19-L25), 返回了从`react`应用开始运行, 到本次调用经过的绝对时间(即`performance.now()`)

然后跟踪[`requestUpdateLane`函数](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L392-L493):

```js
//... 省略部分代码
export function requestUpdateLane(fiber: Fiber): Lane {
  // Special cases
  const mode = fiber.mode;
  if ((mode & BlockingMode) === NoMode) {
    // Legacy 模式
    return (SyncLane: Lane);
  } else if ((mode & ConcurrentMode) === NoMode) {
    // Blocking 模式
    return getCurrentPriorityLevel() === ImmediateSchedulerPriority
      ? (SyncLane: Lane)
      : (SyncBatchedLane: Lane);
  }
  // Concurrent 模式
  if (currentEventWipLanes === NoLanes) {
    currentEventWipLanes = workInProgressRootIncludedLanes;
  }
  const schedulerPriority = getCurrentPriorityLevel();
  let lane;
  const schedulerLanePriority = schedulerPriorityToLanePriority(
    schedulerPriority,
  );
  lane = findUpdateLane(schedulerLanePriority, currentEventWipLanes);
  return lane;
}
```

在`requestUpdateLane`中会根据不同的模式, 返回不同的优先级, 默认情况如下:

- `Legacy`模式为`SyncLane`
- `Blocking`模式为`SyncBatchedLane`
- `Concurrent`模式为`DefaultLanes`

回到`updateContainer`函数, 接下来使用了`requestUpdateLane`返回的优先级, 创建`update`对象, 并添加到`updateQueue`队列中.

此处可以回顾[React 应用中的高频对象](./object-structure.md#Update)章节中已经介绍过`Update`与`UpdateQueue`对象以及它们的数据结构.
需要注意,`update.payload`指向最终 DOM 树将要挂载的节点(`div#root`).

在`updateContainer`函数的最后, 调用了`scheduleUpdateOnFiber(current, lane, eventTime)`进入到`输入`阶段([reconciler 运作流程](./reconciler-workflow.md#输入))的必经函数. 由于本节的主题是`优先级管理`, 所以我们重点跟踪`lane 和 eventTime`这 2 个参数的用途.

```js
// ... 省略部分无关代码
export function scheduleUpdateOnFiber(
  fiber: Fiber,
  lane: Lane,
  eventTime: number,
) {
  const root = markUpdateLaneFromFiberToRoot(fiber, lane);
  if (lane === SyncLane) {
    // Legacy 模式下 lane === SyncLane才成立
    if (
      (executionContext & LegacyUnbatchedContext) !== NoContext &&
      (executionContext & (RenderContext | CommitContext)) === NoContext
    ) {
      // 直接进行`fiber构造`
      performSyncWorkOnRoot(root);
    } else {
      // 注册调度任务, 经过`Scheduler`包的调度, 间接进行`fiber构造`
      ensureRootIsScheduled(root, eventTime);
    }
  } else {
    // Blocking 和 Concurrent模式
    ensureRootIsScheduled(root, eventTime);
  }
}
```

在`scheduleUpdateOnFiber`的主干逻辑中, 只有`Legacy`模式下`lane === SyncLane`才成立, 才会直接进入`performSyncWorkOnRoot`, 否则必然调用`ensureRootIsScheduled`进入到`注册调度任务`. 注意`eventTime`被传入了`ensureRootIsScheduled`.

### 调度阶段

逻辑来到了`ensureRootIsScheduled`中([源码地址](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L674-L736)), 这个函数串联了`react-reconciler`和`scheduler`2 包, 十分重要:

```js
// 本函数每次更新和出调度任务的时候进行调用
function ensureRootIsScheduled(root: FiberRoot, currentTime: number) {
  // 1.  前半部分: 判断是否需要注册新的调度
  const existingCallbackNode = root.callbackNode;
  // 1.1 检查starve, 将已过期的车道(lane), 添加到root.expiredLanes中
  markStarvedLanesAsExpired(root, currentTime);
  // 1.2 获取当前最需要被调度的车道(Lanes)
  const nextLanes = getNextLanes(
    root,
    root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes,
  );
  // 1.3 获取需要调度的车道的优先级等级
  const newCallbackPriority = returnNextLanesPriority();
  // 1.4 如果没有任何车道需要调度, 则退出调度
  if (nextLanes === NoLanes) {
    if (existingCallbackNode !== null) {
      // 取消已经进入调度的任务
      cancelCallback(existingCallbackNode);
      root.callbackNode = null;
      root.callbackPriority = NoLanePriority;
    }
    return;
  }

  // 1.5 如果已经有调度任务了, 则比较old任务与new任务的优先级等级
  if (existingCallbackNode !== null) {
    const existingCallbackPriority = root.callbackPriority;
    if (existingCallbackPriority === newCallbackPriority) {
      // 1.5.1 优先级相同, 表示可以复用old调度任务, 退出循环
      return;
    }
    // 1.5.2 优先级不同, 则取消old调度任务
    cancelCallback(existingCallbackNode);
  }

  // 2. 后半部分: 注册调度任务
  let newCallbackNode;
  // 2.1 注册task并设置回调函数
  if (newCallbackPriority === SyncLanePriority) {
    // legacy 模式
    newCallbackNode = scheduleSyncCallback(
      performSyncWorkOnRoot.bind(null, root),
    );
  } else if (newCallbackPriority === SyncBatchedLanePriority) {
    // blocking 模式
    newCallbackNode = scheduleCallback(
      ImmediateSchedulerPriority,
      performSyncWorkOnRoot.bind(null, root),
    );
  } else {
    // concurrent 模式
    const schedulerPriorityLevel = lanePriorityToSchedulerPriority(
      newCallbackPriority,
    );
    newCallbackNode = scheduleCallback(
      schedulerPriorityLevel,
      performConcurrentWorkOnRoot.bind(null, root),
    );
  }

  // 2.2 在FiberRoot对象上面设置一些标记, 用于再次调用ensureRootIsScheduled时作为比较.
  root.callbackPriority = newCallbackPriority;
  root.callbackNode = newCallbackNode;
}
```

`ensureRootIsScheduled`的逻辑也十分清晰(源码中每一步都有英文注释), 主要分为 2 部分:

1.  前半部分: 确定是否需要注册新的调度(如果无需新的调度, 会退出函数)
2.  后半部分: 注册调度任务

在前半部分中: - 函数`getNextLanes`返回了需要调度的车道(`nextLanes`) - 函数`returnNextLanesPriority`返回了需要调度的车道(`nextLanes`)中, 所占用的最高的优先级. - 函数`lanePriorityToSchedulerPriority`把`lanePriority`转换成`SchedulerPriority`

后半部分调用`scheduleSyncCallback 或 scheduleCallback`:

```js
export function scheduleCallback(
  reactPriorityLevel: ReactPriorityLevel,
  callback: SchedulerCallback,
  options: SchedulerCallbackOptions | void | null,
) {
  // 1. 把reactPriorityLevel转换为SchedulerPriority
  const priorityLevel = reactPriorityToSchedulerPriority(reactPriorityLevel);
  // 2. 注册task
  return Scheduler_scheduleCallback(priorityLevel, callback, options);
}

export function scheduleSyncCallback(callback: SchedulerCallback) {
  if (syncQueue === null) {
    syncQueue = [callback];
    // 使用Scheduler_ImmediatePriority注册task
    immediateQueueCallbackNode = Scheduler_scheduleCallback(
      Scheduler_ImmediatePriority,
      flushSyncCallbackQueueImpl,
    );
  } else {
    syncQueue.push(callback);
  }
  return fakeCallbackNode;
}
```

可见`scheduleSyncCallback 和 scheduleCallback`均调用`Scheduler_scheduleCallback`, 唯一不同的就是优先级.

由于此处涉及到`react-reconciler`包和`scheduler`包的过度, 尤其关注其中优先级的转换. 通过梳理, 在`task`注册过程中, 一共包含了 3 种优先级.

1. `LanePriority`: 属于`react-reconciler`包, 定义与`ReactFiberLane.js`([见源码](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberLane.js#L46-L70)).

   ```js
   export const SyncLanePriority: LanePriority = 15;
   export const SyncBatchedLanePriority: LanePriority = 14;

   const InputDiscreteHydrationLanePriority: LanePriority = 13;
   export const InputDiscreteLanePriority: LanePriority = 12;

   // .....

   const OffscreenLanePriority: LanePriority = 1;
   export const NoLanePriority: LanePriority = 0;
   ```

2. `reactPriorityLevel`, 属于`react-reconciler`包, 定义于`SchedulerWithReactIntegration.js`中([见源码](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/SchedulerWithReactIntegration.old.js#L65-L71)).

   ```js
   export const ImmediatePriority: ReactPriorityLevel = 99;
   export const UserBlockingPriority: ReactPriorityLevel = 98;
   export const NormalPriority: ReactPriorityLevel = 97;
   export const LowPriority: ReactPriorityLevel = 96;
   export const IdlePriority: ReactPriorityLevel = 95;
   // NoPriority is the absence of priority. Also React-only.
   export const NoPriority: ReactPriorityLevel = 90;
   ```

3. `SchedulerPriority`, 属于`scheduler`包, 定义于`SchedulerPriorities.js`中([见源码](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/SchedulerPriorities.js)).
   ```js
   export const NoPriority = 0;
   export const ImmediatePriority = 1;
   export const UserBlockingPriority = 2;
   export const NormalPriority = 3;
   export const LowPriority = 4;
   export const IdlePriority = 5;
   ```

- 与`fiber`构造过程相关的优先级(如`fiber.updateQueue`,`fiber.lanes`)都使用`LanePriority`.
- 与`scheduler`调度中心相关的优先级使用`SchedulerPriority`.
- `LanePriority`与`SchedulerPriority`通过`ReactPriorityLevel`进行转换

在[`SchedulerWithReactIntegration.js`中](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/SchedulerWithReactIntegration.old.js#L93-L125), 转换关系如下:

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

在[`ReactFiberLane.js`中](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberLane.js#L196-L247), 转换关系如下:

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

### fiber 树构造阶段

### 输出

## 总结
