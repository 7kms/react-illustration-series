---
title: 调度原理
---

# React 调度原理(scheduler)

在 React 运行时中, 调度中心(位于`scheduler`包), 是整个 React 运行时的中枢(其实是心脏), 所以理解`scheduler`调度, 就基本把握了 React 的命门.

在深入分析之前, 建议回顾一下往期与`scheduler`相关的文章(这 3 篇文章不长, 共 10 分钟能浏览完):

- [React 工作循环](./workloop.md): 从宏观的角度介绍 React 体系中两个重要的循环, 其中`任务调度循环`就是本文的主角.
- [reconciler 运作流程](./reconciler-workflow.md): 从宏观的角度介绍了`react-reconciler`包的核心作用, 并把`reconciler`分为了 4 个阶段. 其中第 2 个阶段`注册调度任务`串联了`scheduler`包和`react-reconciler`包, 其实就是`任务调度循环`中的一个任务(`task`).
- [React 中的优先级管理](./priority.md): 介绍了 React 体系中的 3 中优先级的管理, 列出了源码中`react-reconciler`与`scheduler`包中关于优先级的转换思路. 其中`SchedulerPriority`控制`任务调度循环`中循环的顺序.

了解上述基础知识之后, 再谈`scheduler`原理, 其实就是在大的框架下去添加实现细节, 相对较为容易. 下面就正式进入主题.

## 调度实现

`调度中心`最核心的代码, 在[SchedulerHostConfig.default.js](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/forks/SchedulerHostConfig.default.js)中.

### 内核

该 js 文件一共导出了 8 个函数, 最核心的逻辑, 就集中在了这 8 个函数中 :

```js
export let requestHostCallback; // 请求及时回调: port.postMessage
export let cancelHostCallback; // 取消及时回调: scheduledHostCallback = null
export let requestHostTimeout; // 请求延时回调: setTimeout
export let cancelHostTimeout; // 取消延时回调: cancelTimeout
export let shouldYieldToHost; // 是否让出主线程(currentTime >= deadline && needsPaint): 让浏览器能够执行更高优先级的任务(如ui绘制, 用户输入等)
export let requestPaint; // 请求绘制: 设置 needsPaint = true
export let getCurrentTime; // 获取当前时间
export let forceFrameRate; // 强制设置 yieldInterval (让出主线程的周期). 这个函数虽然存在, 但是从源码来看, 几乎没有用到
```

我们知道 react 可以在 nodejs 环境中使用, 所以在不同的 js 执行环境中, 这些函数的实现会有区别. 下面基于普通浏览器环境, 对这 8 个函数逐一分析 :

1. 调度相关: 请求或取消调度

- [requestHostCallback](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/forks/SchedulerHostConfig.default.js#L224-L230)
- [cancelHostCallback](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/forks/SchedulerHostConfig.default.js#L232-L234)
- [requestHostTimeout](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/forks/SchedulerHostConfig.default.js#L236-L240)
- [cancelHostTimeout](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/forks/SchedulerHostConfig.default.js#L242-L245)

这 4 个函数源码很简洁, 非常好理解, 它们的目的就是请求执行(或取消)回调函数. 现在重点介绍其中的`及时回调`(`延时回调`的 2 个函数暂时属于保留 api, 17.0.1 版本其实没有用上)

```js
// 接收 MessageChannel 消息
const performWorkUntilDeadline = () => {
  // ...省略无关代码
  if (scheduledHostCallback !== null) {
    const currentTime = getCurrentTime();
    // 更新deadline
    deadline = currentTime + yieldInterval;
    // 执行callback
    scheduledHostCallback(hasTimeRemaining, currentTime);
  } else {
    isMessageLoopRunning = false;
  }
};

const channel = new MessageChannel();
const port = channel.port2;
channel.port1.onmessage = performWorkUntilDeadline;

// 请求回调
requestHostCallback = function(callback) {
  // 1. 保存callback
  scheduledHostCallback = callback;
  if (!isMessageLoopRunning) {
    isMessageLoopRunning = true;
    // 2. 通过 MessageChannel 发送消息
    port.postMessage(null);
  }
};
// 取消回调
cancelHostCallback = function() {
  scheduledHostCallback = null;
};
```

很明显, 请求回调之后`scheduledHostCallback = callback`, 然后通过`MessageChannel`发消息的方式触发`performWorkUntilDeadline`函数, 最后执行回调`scheduledHostCallback`.

此处需要注意: `MessageChannel`在浏览器事件循环中属于`宏任务`, 所以调度中心永远是`异步执行`回调函数.

2. 时间切片(`time slicing`)相关: 执行时间分割, 让出主线程(把控制权归还浏览器, 浏览器可以处理用户输入, UI 绘制等紧急任务).

- [getCurrentTime](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/forks/SchedulerHostConfig.default.js#L22-L24): 获取当前时间
- [shouldYieldToHost](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/forks/SchedulerHostConfig.default.js#L129-L152): 是否让出主线程
- [requestPaint](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/forks/SchedulerHostConfig.default.js#L154-L156): 请求绘制
- [forceFrameRate](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/forks/SchedulerHostConfig.default.js#L168-L183): 强制设置 `yieldInterval`(从源码中的引用来看, 算一个保留函数, 其他地方没有用到)

```js
const localPerformance = performance;
// 获取当前时间
getCurrentTime = () => localPerformance.now();

// 时间切片周期, 默认是5ms(如果一个task运行超过该周期, 下一个task执行之前, 会把控制权归还浏览器)
let yieldInterval = 5;

let deadline = 0;
const maxYieldInterval = 300;
let needsPaint = false;
const scheduling = navigator.scheduling;
// 是否让出主线程
shouldYieldToHost = function() {
  const currentTime = getCurrentTime();
  if (currentTime >= deadline) {
    if (needsPaint || scheduling.isInputPending()) {
      // There is either a pending paint or a pending input.
      return true;
    }
    // There's no pending input. Only yield if we've reached the max
    // yield interval.
    return currentTime >= maxYieldInterval; // 在持续运行的react应用中, currentTime肯定大于300ms, 这个判断只在初始化过程中才有可能返回false
  } else {
    // There's still time left in the frame.
    return false;
  }
};

// 请求绘制
requestPaint = function() {
  needsPaint = true;
};

// 设置时间切片的周期
forceFrameRate = function(fps) {
  if (fps < 0 || fps > 125) {
    // Using console['error'] to evade Babel and ESLint
    console['error'](
      'forceFrameRate takes a positive int between 0 and 125, ' +
        'forcing frame rates higher than 125 fps is not supported',
    );
    return;
  }
  if (fps > 0) {
    yieldInterval = Math.floor(1000 / fps);
  } else {
    // reset the framerate
    yieldInterval = 5;
  }
};
```

这 4 个函数代码都很简洁, 其功能在注释中都有解释.

注意`shouldYieldToHost`的判定条件:

- `currentTime >= deadline`: 只有时间超过`deadline`之后才会让出主线程(其中`deadline = currentTime + yieldInterval`).
  - `yieldInterval`默认是`5ms`, 只能通过`forceFrameRate`函数来修改(事实上在 v17.0.1 源码中, 并没有使用到该函数).
  - 如果一个`task`运行时间超过`5ms`, 下一个`task`执行之前, 会把控制权归还浏览器.
- `navigator.scheduling.isInputPending()`: 这 facebook 官方贡献给 Chromium 的 api, 现在已经列入 W3C 标准([具体解释](https://engineering.fb.com/2019/04/22/developer-tools/isinputpending-api/)), 用于判断是否有输入事件(包括: input 框输入事件, 点击事件等).

介绍完这 8 个内部函数, 最后浏览一下完整回调的实现[performWorkUntilDeadline](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/forks/SchedulerHostConfig.default.js#L185-L218)(逻辑很清晰, 在注释中解释):

```js
const performWorkUntilDeadline = () => {
  if (scheduledHostCallback !== null) {
    const currentTime = getCurrentTime(); // 1. 获取当前时间
    deadline = currentTime + yieldInterval; // 2. 设置deadeline
    const hasTimeRemaining = true;
    try {
      // 3. 执行回调, 返回是否有还有剩余任务
      const hasMoreWork = scheduledHostCallback(hasTimeRemaining, currentTime);
      if (!hasMoreWork) {
        // 没有剩余任务, 退出
        isMessageLoopRunning = false;
        scheduledHostCallback = null;
      } else {
        port.postMessage(null); // 有剩余任务, 发起新的调度
      }
    } catch (error) {
      port.postMessage(null); // 如有异常, 重新发起调度
      throw error;
    }
  } else {
    isMessageLoopRunning = false;
  }
  needsPaint = false; // 重置开关
};
```

分析到这里, 可以得到调度中心的内核实现图:

![](../../snapshots/scheduler/core.png)

说明: 这个流程图很简单, 源码量也很少(总共不到 80 行), 但是它代表了`scheduler`的核心, 所以精华其实并不一定需要很多代码.

### 任务队列管理

通过上文的分析, 我们已经知道请求和取消调度的实现原理. 调度的目的是为了消费任务, 接下来就具体分析任务队列是如何管理与实现的.

在[Scheduler.js](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/Scheduler.js)中, 维护了一个[taskQueue](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/Scheduler.js#L63), 任务队列管理就是围绕这个`taskQueue`展开.

```js
// Tasks are stored on a min heap
var taskQueue = [];
var timerQueue = [];
```

注意:

- `taskQueue`是一个小顶堆数组, 关于堆排序的详细解释, 可以查看[React 算法之堆排序](../algorithm/heapsort.md).
- 源码中除了`taskQueue`队列之外还有一个`timerQueue`队列. 这个队列是预留给延时任务使用的, 在 react@17.0.1 版本里面, 从源码中的引用来看, 算一个保留功能, 没有用到.

#### 创建任务

在`unstable_scheduleCallback`函数中([源码链接](https://github.com/facebook/react/blob/v17.0.1/packages/scheduler/src/Scheduler.js#L279-L359)):

```js
// 省略部分无关代码
function unstable_scheduleCallback(priorityLevel, callback, options) {
  // 1. 获取当前时间
  var currentTime = getCurrentTime();
  var startTime;
  if (typeof options === 'object' && options !== null) {
    // 从函数调用关系来看, 在v17.0.1中,所有调用 unstable_scheduleCallback 都未传入options
    // 所以省略延时任务相关的代码
  } else {
    startTime = currentTime;
  }
  // 2. 根据传入的优先级, 设置任务的过期时间 expirationTime
  var timeout;
  switch (priorityLevel) {
    case ImmediatePriority:
      timeout = IMMEDIATE_PRIORITY_TIMEOUT;
      break;
    case UserBlockingPriority:
      timeout = USER_BLOCKING_PRIORITY_TIMEOUT;
      break;
    case IdlePriority:
      timeout = IDLE_PRIORITY_TIMEOUT;
      break;
    case LowPriority:
      timeout = LOW_PRIORITY_TIMEOUT;
      break;
    case NormalPriority:
    default:
      timeout = NORMAL_PRIORITY_TIMEOUT;
      break;
  }
  var expirationTime = startTime + timeout;
  // 3. 创建新任务
  var newTask = {
    id: taskIdCounter++,
    callback,
    priorityLevel,
    startTime,
    expirationTime,
    sortIndex: -1,
  };
  if (startTime > currentTime) {
    // 省略无关代码 v17.0.1中不会使用
  } else {
    newTask.sortIndex = expirationTime;
    // 4. 加入任务队列
    push(taskQueue, newTask);
    // 5. 请求调度
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork);
    }
  }
  return newTask;
}
```

逻辑很清晰(在注释中已标明), 重点分析`task`对象的各个属性:

```js
var newTask = {
  id: taskIdCounter++, // id: 一个自增编号
  callback, // callback: 传入的回调函数
  priorityLevel, // priorityLevel: 优先级等级
  startTime, // startTime: 创建task时的当前时间
  expirationTime, // expirationTime: task的过期时间, 优先级越高 expirationTime = startTime + timeout 越小
  sortIndex: -1,
};
newTask.sortIndex = expirationTime; // sortIndex: 排序索引, 全等于过期时间. 保证过期时间越小, 越紧急的任务排在最前面
```

#### 消费任务

创建任务之后, 最后请求调度`requestHostCallback(flushWork)`(`创建任务`源码中的第 5 步), `flushWork`函数作为参数被传入调度中心内核等待回调. `requestHostCallback`函数在上文调度内核中已经介绍过了, 在调度中心中, 只需下一个事件循环就会执行回调, 最终执行`flushWork`.

```js
// 省略无关代码
function flushWork(hasTimeRemaining, initialTime) {
  // 1. 做好全局标记, 表示现在已经进入调度阶段
  isHostCallbackScheduled = false;
  isPerformingWork = true;
  const previousPriorityLevel = currentPriorityLevel;
  try {
    // 2. 循环消费队列
    return workLoop(hasTimeRemaining, initialTime);
  } finally {
    // 3. 还原全局标记
    currentTask = null;
    currentPriorityLevel = previousPriorityLevel;
    isPerformingWork = false;
  }
}
```

`flushWork`中调用了`workLoop`. 队列消费的主要逻辑是在`workLoop`函数中, 这就是[React 工作循环](./workloop.md)一文中提到的`任务调度循环`.

```js
// 省略部分无关代码
function workLoop(hasTimeRemaining, initialTime) {
  let currentTime = initialTime; // 保存当前时间, 用于判断任务是否过期
  currentTask = peek(taskQueue); // 获取队列中的第一个任务
  while (currentTask !== null) {
    if (
      currentTask.expirationTime > currentTime &&
      (!hasTimeRemaining || shouldYieldToHost())
    ) {
      // 虽然currentTask没有过期, 但是执行时间超过了限制(毕竟只有5ms, shouldYieldToHost()返回true). 停止继续执行, 让出主线程
      break;
    }
    const callback = currentTask.callback;
    if (typeof callback === 'function') {
      currentTask.callback = null;
      currentPriorityLevel = currentTask.priorityLevel;
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      // 执行回调
      const continuationCallback = callback(didUserCallbackTimeout);
      currentTime = getCurrentTime();
      // 回调完成, 判断是否还有连续(派生)回调
      if (typeof continuationCallback === 'function') {
        // 产生了连续回调(如fiber树太大, 出现了中断渲染), 保留currentTask
        currentTask.callback = continuationCallback;
      } else {
        // 把currentTask移出队列
        if (currentTask === peek(taskQueue)) {
          pop(taskQueue);
        }
      }
    } else {
      // 如果任务被取消(这时currentTask.callback = null), 将其移出队列
      pop(taskQueue);
    }
    // 更新currentTask
    currentTask = peek(taskQueue);
  }
  if (currentTask !== null) {
    return true; // 如果task队列没有清空, 返回ture. 等待调度中心下一次回调
  } else {
    return false; // task队列已经清空, 返回false.
  }
}
```

`workLoop`就是一个大循环, 虽然代码也不多, 但是非常精髓, 在此处实现了`时间切片(time slicing)`和`fiber树的可中断渲染`. 这 2 大特性的实现, 都集中于这个`while`循环.

每一次`while`循环的退出就是一个时间切片, 深入分析`while`循环的退出条件:

1. 队列被完全清空: 这种情况就是很正常的情况, 一气呵成, 没有遇到任何阻碍.
2. 执行超时: 在消费`taskQueue`时, 在执行`task.callback`之前, 都会检测是否超时, 所以超时检测是以`task`为单位.
   - 如果某个`task.callback`执行时间太长(如: `fiber树`很大, 或逻辑很重)也会造成超时
   - 所以在执行`task.callback`过程中, 也需要一种机制检测是否超时, 如果超时了就立刻暂停`task.callback`的执行.

#### 时间切片原理

消费任务队列的过程中, 可以消费`1~n`个 task, 甚至清空整个 queue. 但是在每一次具体执行`task.callback`之前都要进行超时检测, 如果超时可以立即退出循环并等待下一次调用.

#### 可中断渲染原理

在时间切片的基础之上, 如果单个`task.callback`执行时间就很长(假设 200ms). 就需要`task.callback`自己能够检测是否超时, 所以在 fiber 树构造过程中, 每构造完成一个单元, 都会检测一次超时([源码链接](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L1637-L1639)), 如遇超时就退出`fiber树构造循环`, 并返回一个新的回调函数(就是此处的`continuationCallback`)并等待下一次回调继续未完成的`fiber树构造`.

## 节流防抖

通过上文的分析, 已经覆盖了`scheduler`包中的核心原理. 现在再次回到`react-reconciler`包中, 在调度过程中的关键路径中, 我们还需要理解一些细节.

在[reconciler 运作流程](./reconciler-workflow.md)中总结的 4 个阶段中, `注册调度任务`属于第 2 个阶段, 核心逻辑位于`ensureRootIsScheduled`函数中.
现在我们已经理解了`调度原理`, 再次分析`ensureRootIsScheduled`([源码地址](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L674-L736)):

```js
// ... 省略部分无关代码
function ensureRootIsScheduled(root: FiberRoot, currentTime: number) {
  // 前半部分: 判断是否需要注册新的调度
  const existingCallbackNode = root.callbackNode;
  const nextLanes = getNextLanes(
    root,
    root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes,
  );
  const newCallbackPriority = returnNextLanesPriority();
  if (nextLanes === NoLanes) {
    return;
  }
  // 节流防抖
  if (existingCallbackNode !== null) {
    const existingCallbackPriority = root.callbackPriority;
    if (existingCallbackPriority === newCallbackPriority) {
      return;
    }
    cancelCallback(existingCallbackNode);
  }
  // 后半部分: 注册调度任务 省略代码...

  // 更新标记
  root.callbackPriority = newCallbackPriority;
  root.callbackNode = newCallbackNode;
}
```

正常情况下, `ensureRootIsScheduled`函数会与`scheduler`包通信, 最后注册一个`task`并等待回调.

1. 在`task`注册完成之后, 会设置`fiberRoot`对象上的属性(`fiberRoot`是 react 运行时中的重要全局对象, 可参考[React 应用的启动过程](./bootstrap.md#创建全局对象)), 代表现在已经处于调度进行中
2. 再次进入`ensureRootIsScheduled`时(比如连续 2 次`setState`, 第 2 次`setState`同样会触发`reconciler运作流程`中的调度阶段), 如果发现处于调度中, 则需要一些节流和防抖措施, 进而保证调度性能.
   1. 节流(判断条件: `existingCallbackPriority === newCallbackPriority`, 新旧更新的优先级相同, 如连续多次执行`setState`), 则无需注册新`task`(继续沿用上一个优先级相同的`task`), 直接退出调用.
   2. 防抖(判断条件: `existingCallbackPriority !== newCallbackPriority`, 新旧更新的优先级不同), 则取消旧`task`, 重新注册新`task`.

## 总结

本节主要分析了`scheduler`包中`调度原理`, 也就是`React两大工作循环`中的`任务调度循环`. 并介绍了`时间切片`和`可中断渲染`等特性在`任务调度循环`中的实现. `scheduler`包是`React`运行时的心脏, 为了提升调度性能, 注册`task`之前, 在`react-reconciler`包中做了节流和防抖等措施.
