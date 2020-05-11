# 调度机制

从[第一次render](./02-render-process.md#执行调度)的分析中知道,ReactFiber工作循环入口函数是`scheduleUpdateOnFiber`.`scheduleUpdateOnFiber`接受渲染器的输入信号, 通过调度机制, 最后再把结果输出给渲染器.

所以分析scheduler机制, 也会从`scheduleUpdateOnFiber`作为入口.

在正式分析之前, 沿用[第一次render](./02-render-process.md)中定义的`<App/>`组件的结构如下:
```js
class App extends React.Component{
  componentDidMount(){
    console.log('App componentDidMount')
  }
  render(){
    return (
      <div class="wrap">
        <Box/>
        <span>list组件</span>
    </div>
    );
  }
}
class Box extends React.Component{
  state = {
    count: 0
  }
  handleClick = ()=>{
    this.setState(state=>{
      return {
        count: ++state.count
      }
    })
  }
  componentDidMount(){
    console.log('Box componentDidMount')
  }
  render(){
    return <button onClick={this.handleClick}>点击次数({this.state.count})</button>
  }
}
```
`<Box/>`组件中, `button`上绑定一个`onClick`事件, 点击按钮之后执行`handleClick`函数, 并且调用`setState`触发更新.


## 环境准备

从[合成事件](./05-syntheticEvent.md#事件触发)中, 对事件触发的分析得知, `onClick`事件对应的`listener`是`dispatchDiscreteEvent`. 
且在执行`handleClick`回调之前, `ReactFiberWorkLoop`中的执行上下文和`Scheduler`中的当前优先级都已经设置完毕.

1. `ReactFiberWorkLoop`: `excutionContext |= DiscreteEventContext`
2. `Scheduler`: `currentPriorityLevel = UserBlockingPriority`

## 调度更新

跟踪`setState`, 最后会调用`React.Component`实例的`updater.enqueueSetState`
```js
enqueueSetState(inst, payload, callback) {
    const fiber = getInstance(inst);
    const currentTime = requestCurrentTimeForUpdate();
    const suspenseConfig = requestCurrentSuspenseConfig();
    const expirationTime = computeExpirationForFiber(
      currentTime,
      fiber,
      suspenseConfig,
    ); // 返回Sync
    const update = createUpdate(expirationTime, suspenseConfig);
    update.payload = payload;
    enqueueUpdate(fiber, update);
    scheduleUpdateOnFiber(fiber, expirationTime);
}
```

在[应用初始化](./02-render-process.md#应用初始化)中有分析, 以`ReactDOM.render()`方式进行引导的`react`应用, 所有节点`fiber.mode = NoMode`. 所以在执行`computeExpirationForFiber`总是会返回`Sync`. 这也决定传入`scheduleUpdateOnFiber(fiber: Fiber, expirationTime: ExpirationTime,)`中的`ExpirationTime=Sync`(这里是为了说明`ExpirationTime=Sync`, 对于`Scheduler`机制的讨论不会受到`ExpirationTime=xxx`的限制)
```js
export function computeExpirationForFiber(
  currentTime: ExpirationTime,
  fiber: Fiber,
  suspenseConfig: null | SuspenseConfig,
): ExpirationTime {
  const mode = fiber.mode;
  if ((mode & BlockingMode) === NoMode) {
    return Sync;
  }
  const priorityLevel = getCurrentPriorityLevel();
  if ((mode & ConcurrentMode) === NoMode) {
    return priorityLevel === ImmediatePriority ? Sync : Batched;
  }
  // ...
}
```

现在正式进入了`scheduleUpdateOnFiber`

```js
export function scheduleUpdateOnFiber(
  fiber: Fiber,
  expirationTime: ExpirationTime,
) {
  //1. 设置从当前Fiber开始一直向上直到RootFiber节点的过期时间(expirationTime, childExpirationTime)
  // 更新FiberRoot对象, 等待中任务(pending)的时间区间(firstPendingTime, lastPendingTime)
  // 更新FiberRoot对象, 挂起任务(suspended)的时间区间(firstSuspendedTime, lastSuspendedTime)
  const root = markUpdateTimeFromFiberToRoot(fiber, expirationTime);
  // onClick事件: currentPriorityLevel = UserBlockingPriority
  const priorityLevel = getCurrentPriorityLevel();

  if (expirationTime === Sync) {
    if (
      // Check if we're inside unbatchedUpdates
      (executionContext & LegacyUnbatchedContext) !== NoContext &&
      // Check if we're not already rendering
      (executionContext & (RenderContext | CommitContext)) === NoContext
    ) {
      // Register pending interactions on the root to avoid losing traced interaction data.
      schedulePendingInteractions(root, expirationTime);

      // This is a legacy edge case. The initial mount of a ReactDOM.render-ed
      // root inside of batchedUpdates should be synchronous, but layout updates
      // should be deferred until the end of the batch.
      performSyncWorkOnRoot(root);
    } else {
      ensureRootIsScheduled(root);
      schedulePendingInteractions(root, expirationTime);
      if (executionContext === NoContext) {
        // Flush the synchronous work now, unless we're already working or inside
        // a batch. This is intentionally inside scheduleUpdateOnFiber instead of
        // scheduleCallbackForFiber to preserve the ability to schedule a callback
        // without immediately flushing it. We only do this for user-initiated
        // updates, to preserve historical behavior of legacy mode.
        flushSyncCallbackQueue();
      }
    }
  } else {
    // Schedule a discrete update but only if it's not Sync.
    if (
      (executionContext & DiscreteEventContext) !== NoContext &&
      // Only updates at user-blocking priority or greater are considered
      // discrete, even inside a discrete event.
      (priorityLevel === UserBlockingPriority ||
        priorityLevel === ImmediatePriority)
    ) {
      // This is the result of a discrete event. Track the lowest priority
      // discrete update per root so we can flush them early, if needed.
      if (rootsWithPendingDiscreteUpdates === null) {
        rootsWithPendingDiscreteUpdates = new Map([[root, expirationTime]]);
      } else {
        const lastDiscreteTime = rootsWithPendingDiscreteUpdates.get(root);
        if (
          lastDiscreteTime === undefined ||
          lastDiscreteTime > expirationTime
        ) {
          rootsWithPendingDiscreteUpdates.set(root, expirationTime);
        }
      }
    }
    // Schedule other updates after in case the callback is sync.
    ensureRootIsScheduled(root);
    schedulePendingInteractions(root, expirationTime);
  }
}
```
[第一次render](./02-render-process.md#执行调度)会进入`performSyncWorkOnRoot`, 其余情况都会执行`ensureRootIsScheduled`.

## 执行调度
`ensureRootIsScheduled`

```js
// Use this function to schedule a task for a root. There's only one task per
// root; if a task was already scheduled, we'll check to make sure the
// expiration time of the existing task is the same as the expiration time of
// the next level that the root has work on. This function is called on every
// update, and right before exiting a task.
function ensureRootIsScheduled(root: FiberRoot) {
  const lastExpiredTime = root.lastExpiredTime;
  // 1. 如果有过期任务, 需要立即同步更新
  if (lastExpiredTime !== NoWork) {
    // Special case: Expired work should flush synchronously.
    root.callbackExpirationTime = Sync;
    root.callbackPriority_old = ImmediatePriority;
    root.callbackNode = scheduleSyncCallback(
      performSyncWorkOnRoot.bind(null, root),
    );
    return;
  }

  const expirationTime = getNextRootExpirationTimeToWorkOn(root);
  const existingCallbackNode = root.callbackNode;
  // 2. 没有新的任务, 退出调度
  if (expirationTime === NoWork) {
    // There's nothing to work on.
    if (existingCallbackNode !== null) {
      root.callbackNode = null;
      root.callbackExpirationTime = NoWork;
      root.callbackPriority_old = NoPriority;
    }
    return;
  }

  // TODO: If this is an update, we already read the current time. Pass the
  // time as an argument.
  const currentTime = requestCurrentTimeForUpdate();
  const priorityLevel = inferPriorityFromExpirationTime(
    currentTime,
    expirationTime,
  );

  // If there's an existing render task, confirm it has the correct priority and
  // expiration time. Otherwise, we'll cancel it and schedule a new one.
  if (existingCallbackNode !== null) {
    const existingCallbackPriority = root.callbackPriority_old;
    const existingCallbackExpirationTime = root.callbackExpirationTime;
    if (
      // Callback must have the exact same expiration time.
      existingCallbackExpirationTime === expirationTime &&
      // Callback must have greater or equal priority.
      existingCallbackPriority >= priorityLevel
    ) {
      // Existing callback is sufficient.
      return;
    }
    // Need to schedule a new task.
    // TODO: Instead of scheduling a new task, we should be able to change the
    // priority of the existing one.
    cancelCallback(existingCallbackNode);
  }

  root.callbackExpirationTime = expirationTime;
  root.callbackPriority_old = priorityLevel;

  let callbackNode;
  if (expirationTime === Sync) {
    // Sync React callbacks are scheduled on a special internal queue
    callbackNode = scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
  } else if (disableSchedulerTimeoutBasedOnReactExpirationTime) {
    callbackNode = scheduleCallback(
      priorityLevel,
      performConcurrentWorkOnRoot.bind(null, root),
    );
  } else {
    callbackNode = scheduleCallback(
      priorityLevel,
      performConcurrentWorkOnRoot.bind(null, root),
      // Compute a task timeout based on the expiration time. This also affects
      // ordering because tasks are processed in timeout order.
      {timeout: expirationTimeToMs(expirationTime) - now()},
    );
  }

  root.callbackNode = callbackNode;
}
```
核心步骤:
在`Scheduler`中注册task
>  目的是为了调用`scheduleSyncCallback`并将返回值设置到`FiberRoot.callbackNode`
1. 有过期任务, 把`FiberRoot.callbackNode`设置成同步回调
  
  ```js
    root.callbackExpirationTime = Sync;
    root.callbackPriority_old = ImmediatePriority;
    root.callbackNode = scheduleSyncCallback(
      performSyncWorkOnRoot.bind(null, root),
    );
  ```
2. 没有新的任务, 退出调度

3. 有历史任务(`FiberRoot.callbackNode !== null`)
    - 新旧任务的过期时间相等, 且旧任务的优先级 `>=` 新任务优先级, 则退出调度.(新任务会在旧任务执行完成之后的同步刷新钩子中执行)
    - 新旧任务的过期时间不同, 或者且旧任务的优先级 `<` 新任务优先级, 会取消旧任务. 

4. 根据`expirationTime`设置`FiberRoot.callbackNode`

```js
    if (expirationTime === Sync) {
      // Sync React callbacks are scheduled on a special internal queue
      callbackNode = scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
    } else if (disableSchedulerTimeoutBasedOnReactExpirationTime) {
      callbackNode = scheduleCallback(
        priorityLevel,
        performConcurrentWorkOnRoot.bind(null, root),
      );
    } else {
      callbackNode = scheduleCallback(
        priorityLevel,
        performConcurrentWorkOnRoot.bind(null, root),
        // Compute a task timeout based on the expiration time. This also affects
        // ordering because tasks are processed in timeout order.
        {timeout: expirationTimeToMs(expirationTime) - now()},
      );
    }
```

`scheduleSyncCallback`
```js
export function scheduleSyncCallback(callback: SchedulerCallback) {
  // Push this callback into an internal queue. We'll flush these either in
  // the next tick, or earlier if something calls `flushSyncCallbackQueue`.
  if (syncQueue === null) {
    syncQueue = [callback];
    // Flush the queue in the next tick, at the earliest.
    immediateQueueCallbackNode = Scheduler_scheduleCallback(
      Scheduler_ImmediatePriority,
      flushSyncCallbackQueueImpl,
    );
  } else {
    // Push onto existing queue. Don't need to schedule a callback because
    // we already scheduled one when we created the queue.
    syncQueue.push(callback);
  }
  return fakeCallbackNode;
}
```
`scheduleCallback`
```js

export function scheduleCallback(
  reactPriorityLevel: ReactPriorityLevel,
  callback: SchedulerCallback,
  options: SchedulerCallbackOptions | void | null,
) {
  const priorityLevel = reactPriorityToSchedulerPriority(reactPriorityLevel);
  return Scheduler_scheduleCallback(priorityLevel, callback, options);
}
```
核心步骤:

scheduleSyncCallback:

1. 把`callback`添加到`syncQueue`中
  - 如果第一次创建`syncQueue`, 会以`Scheduler_ImmediatePriority`执行调度`Scheduler_scheduleCallback`

scheduleCallback:

以推断出来的优先级(legacymode下都是`ImmediatePriority`)执行调度`Scheduler_scheduleCallback`


`unstable_scheduleCallback`:

```js
/**
 * 1. 创建新的task
 * 2. 根据task.startTime和currentTime的比较
 * 3. 请求主线程回调, 或者主线程延时回调
 * @param {*} priorityLevel 
 * @param {*} callback 
 * @param {*} options 
 */
function unstable_scheduleCallback(priorityLevel, callback, options) {
  var currentTime = getCurrentTime();

  var startTime;
  var timeout;
  if (typeof options === 'object' && options !== null) {
    var delay = options.delay;
    if (typeof delay === 'number' && delay > 0) {
      startTime = currentTime + delay;
    } else {
      startTime = currentTime;
    }
    timeout =
      typeof options.timeout === 'number'
        ? options.timeout
        : timeoutForPriorityLevel(priorityLevel);
  } else {
    timeout = timeoutForPriorityLevel(priorityLevel);
    startTime = currentTime;
  }

  var expirationTime = startTime + timeout;
  // 新建任务
  var newTask = {
    id: taskIdCounter++,
    callback,
    priorityLevel,
    startTime,
    expirationTime,
    sortIndex: -1,
  };
  if (enableProfiling) {
    newTask.isQueued = false;
  }

  if (startTime > currentTime) {
    // 延时任务
    // This is a delayed task.
    newTask.sortIndex = startTime;
    push(timerQueue, newTask);
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      // All tasks are delayed, and this is the task with the earliest delay.
      if (isHostTimeoutScheduled) {
        // Cancel an existing timeout.
        cancelHostTimeout();
      } else {
        isHostTimeoutScheduled = true;
      }
      // Schedule a timeout.
      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  } else {
    // 及时任务
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);
    if (enableProfiling) {
      markTaskStart(newTask, currentTime);
      newTask.isQueued = true;
    }
    // Schedule a host callback, if needed. If we're already performing work,
    // wait until the next time we yield.
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork);
    }
  }

  return newTask;
}
```
