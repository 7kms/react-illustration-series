# React 更新机制

在[React 应用初始化](./02-bootstrap.md)中介绍了`react`应用启动的 3 种模式.为了简便, 这里在`legacy`模式为前提之下进行讨论. 对于`concurrent`和`blocking`的讨论, 在`任务分片`中详细展开.

正常 react 应用有 3 种主动更新方式:

1. `Class`组件中主动调用`setState`.
2. `Function`组件中使用`hook`对象的`dispatchAction`.
3. 改变`context`

## setState

继续使用[首次 render](./03-render-process.md)中的例子.

定义`<App/>`组件的结构如下:

```js
class App extends React.Component {
  componentDidMount() {
    console.log('App componentDidMount');
  }
  render() {
    return (
      <div className="wrap">
        <Box />
        <span>list组件</span>
      </div>
    );
  }
}
class Box extends React.Component {
  state = {
    count: 0,
  };
  handleClick = () => {
    this.setState(state => {
      return {
        count: ++state.count,
      };
    });
  };
  componentDidMount() {
    console.log('Box componentDidMount');
  }
  render() {
    return (
      <button onClick={this.handleClick}>点击次数({this.state.count})</button>
    );
  }
}
```

在初次`render`结束后, 工作空间的主要变量的状态如下:

![](../snapshots/firstrender-workloop-03.png)

### 环境准备

从[合成事件](./04-syntheticEvent.md#事件触发)中对事件触发的分析得知, `onClick`事件对应的`listener`是`dispatchDiscreteEvent`.

所以在执行`handleClick`回调之前, 可以明确当前环境:

1. 工作空间(`ReactFiberWorkLoop`)执行上下文: `excutionContext |= DiscreteEventContext`
2. 调度(`Scheduler`)优先级: `currentPriorityLevel = UserBlockingPriority`

### 调度更新

点击`button`,触发合成事件,最后在`handleClick`中执行`setState`. 跟踪`setState`函数的调用栈:

在`Component`对象的原型中有:

```js
Component.prototype.setState = function(partialState, callback) {
  this.updater.enqueueSetState(this, partialState, callback, 'setState');
};
```

在[首次 render](./03-render-process.md#beginWork)中的`beginWork`阶段, class 类型的组件初始化完成之后, `this.updater`对象如下:

```js
const classComponentUpdater = {
  isMounted,
  enqueueSetState(inst, payload, callback) {
    // 1. 获取class实例对应的Fiber节点
    const fiber = getInstance(inst);
    // 2. 创建update对象
    // 2.1 计算本次更新的过期时间expirationTime
    const currentTime = requestCurrentTimeForUpdate();
    const suspenseConfig = requestCurrentSuspenseConfig();
    // legacy下expirationTime = Sync
    const expirationTime = computeExpirationForFiber(
      currentTime,
      fiber,
      suspenseConfig,
    );
    // 2.1 根据当前时间和过期时间, 创建update对象
    const update = createUpdate(currentTime, expirationTime, suspenseConfig);
    update.payload = payload;
    if (callback !== undefined && callback !== null) {
      update.callback = callback;
    }
    // 3. 将update对象添加到当前Fiber节点的updateQueue队列当中
    enqueueUpdate(fiber, update);
    // 4. 在当前Fiber节点上进行调度更新
    scheduleUpdateOnFiber(fiber, expirationTime);
  },
};
```

核心步骤:

1. 获取`class`实例对应的`Fiber`节点
2. 创建`update`对象
3. 将`update`对象添加到当前 Fiber 节点的`updateQueue`队列当中
4. 调用`scheduleUpdateOnFiber`, 从当前节点调度更新

#### scheduleUpdateOnFiber

```js
export function scheduleUpdateOnFiber(
  fiber: Fiber,
  expirationTime: ExpirationTime,
) {
  const root = markUpdateTimeFromFiberToRoot(fiber, expirationTime);
  if (expirationTime === Sync) {
    // leagcy下, expirationTime = Sync
    if (
      (executionContext & LegacyUnbatchedContext) !== NoContext &&
      (executionContext & (RenderContext | CommitContext)) === NoContext
    ) {
      // ... 第一次render进入
    } else {
      // 更新时进入
      ensureRootIsScheduled(root);
      schedulePendingInteractions(root, expirationTime);
      if (executionContext === NoContext) {
        flushSyncCallbackQueue();
      }
    }
  }
}
```

#### markUpdateTimeFromFiberToRoot

![](../snapshots/update/markupdatetime.png)

1. 从当前 fiber 节点开始, 向上查找直到`HostRootFiber`, 标记当前`fiber.expirationTime`
2. 标记所有父节点(包括 alternate)的`childExpirationTime`
3. 设置`fiberRoot`上的`pendingTime`和`suspendedTime`(非`legacy`模式下会使用)

#### ensureRootIsScheduled

通过[Scheduler 调度机制](./05-scheduler.md)的分析, legacy 下`ensureRootIsScheduled`是对`performSyncWorkOnRoot`进行包装.

#### performSyncWorkOnRoot

`performSyncWorkOnRoot`,的流程可以参照[首次 render](./03-render-process.md#从FiberRoot节点开始进行更新)中的流程:

![](../snapshots/function-call-updatecontainer.png)

和[首次 render](./03-render-process.md#从FiberRoot节点开始进行更新)比较的异同点如下:

相同点:

1. 调用`renderRootSync`生成新的`fiber`树
2. `fiberRoot.finishedWork`上挂载最新的`fiber`树
3. `fiberRoot`传入`commitWork`函数, 最终更新`DOM`
   不同点:
4. `renderRootSync`内部生成`fiber`的逻辑不同

```js
function performSyncWorkOnRoot(root) {
  let expirationTime;
  // legacy下 expirationTime = Sync;
  expirationTime = Sync;
  // 1. update阶段生成新的fiber树
  let exitStatus = renderRootSync(root, expirationTime);
  // 2. 设置root.finishedWork为最新的fiber树
  const finishedWork: Fiber = (root.current.alternate: any);
  root.finishedWork = finishedWork;
  root.finishedExpirationTime = expirationTime;
  root.nextKnownPendingLevel = getRemainingExpirationTime(finishedWork);
  // 3. 执行commit阶段
  commitRoot(root);
  // 4. 请求调度
  ensureRootIsScheduled(root);
  return null;
}
```

#### renderRootSync

```js
function renderRootSync(root, expirationTime) {
  // 1. 设置执行上下文
  const prevExecutionContext = executionContext;
  executionContext |= RenderContext;
  if (root !== workInProgressRoot || expirationTime !== renderExpirationTime) {
    // 2. 重置工作空间(workloop)中全局变量
    prepareFreshStack(root, expirationTime);
    startWorkOnPendingInteractions(root, expirationTime);
  }
  do {
    try {
      // 3. 执行同步工作循环
      workLoopSync();
      break;
    } catch (thrownValue) {
      handleError(root, thrownValue);
    }
  } while (true);
  executionContext = prevExecutionContext;
  workInProgressRoot = null;
  return workInProgressRootExitStatus;
}
```

#### prepareFreshStack

重置工作空间(workloop)中全局变量之后, 工作空间如下表示:

![](../snapshots/update/workloop-01.png)

注意:

1. `fiberRoot.current`指向的是当前 dom 对应的 fiber 树
2. `workInProgress`指向`fiberRoot.current.alternate`称为`HostRootFiber(alternate)`
3. `workInProgress`在`prepareFreshStack`后会切换 fiber 树(切换到`alternate`分支)
4. `HostRootFiber(alternate).child`指向`HostRootFiber.child`

#### workLoopSync

`workLoopSync`和[首次 render](./03-render-process.md#workLoopSync)中的`workLoopSync`逻辑是一致的, 核心流程:

![](../snapshots/function-call-workloopsync.png)

进入具体的`fiber`更新流程:

#### beginWork

```js
// 省略部分代码
function beginWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderExpirationTime: ExpirationTime,
): Fiber | null {
  const updateExpirationTime = workInProgress.expirationTime;
  if (current !== null) {
    const oldProps = current.memoizedProps;
    const newProps = workInProgress.pendingProps;
    if (
      oldProps !== newProps ||
      hasLegacyContextChanged() ||
      // Force a re-render if the implementation changed due to hot reload:
      (__DEV__ ? workInProgress.type !== current.type : false)
    ) {
      // If props or context changed, mark the fiber as having performed work.
      // This may be unset if the props are determined to be equal later (memo).
      didReceiveUpdate = true;
    } else if (updateExpirationTime < renderExpirationTime) {
      didReceiveUpdate = false;
      // ...
      return bailoutOnAlreadyFinishedWork(
        current,
        workInProgress,
        renderExpirationTime,
      );
    } else {
      didReceiveUpdate = false;
    }
  } else {
    didReceiveUpdate = false;
  }

  workInProgress.expirationTime = NoWork;

  switch (workInProgress.tag) {
    case ClassComponent: {
      const Component = workInProgress.type;
      const unresolvedProps = workInProgress.pendingProps;
      const resolvedProps =
        workInProgress.elementType === Component
          ? unresolvedProps
          : resolveDefaultProps(Component, unresolvedProps);
      return updateClassComponent(
        current,
        workInProgress,
        Component,
        resolvedProps,
        renderExpirationTime,
      );
    }
    case HostRoot:
      return updateHostRoot(current, workInProgress, renderExpirationTime);
    case HostComponent:
      return updateHostComponent(current, workInProgress, renderExpirationTime);
    case HostText:
      return updateHostText(current, workInProgress);
  }
}
```

核心流程:

![](../snapshots/update/beginwork.png)

1. 为了向下更新`workInProgress.child`节点(直到`workInProgress.child=null`), 最终形成完整的`fiber`树
2. 如果`current`指针存在
   1. `workInProgress`有更新(`props`或`context`有变动), 调用`update(mount)XXXComponent`
   2. `workInProgress`没有更新, 调用`bailoutOnAlreadyFinishedWork`
      - 通过`childExpirationTime`判断子节点是否有更新, 如果有更新则调用`cloneChildFibers(current,workInProgress)`,将 current 的子节点 clone 到 workInProgress 中
3. 如果`current`指针为`null`(初次`render`), 调用`update(mount)XXXComponent`

##### update(mount)XXXComponent

`update(mount)XXXComponent`分为两种情况

1. 停止向下
   - 已经是末端节点(如`HostText`类型节点), 无需再往下更新
2. 继续向下
   - `class`类型的节点且`shouldComponentUpdate`返回`false`, 会调用`bailoutOnAlreadyFinishedWork`(同为向下逻辑)
   - 调用`reconcileChildren`进入调和算法

#### reconcileChildren

目的:

1. 给新增和删除的`fiber`节点设置`effectTag`(打上副作用标记)
2. 如果是需要删除的`fiber`, 除了自身打上`effectTag`之外, 还要将其添加到父节点的`effects`链表中(该节点会脱离`fiber`树, 不会再进入`completeWork`阶段).

方法:

1. 单元素

   1. 调用`reconcileSingleElement`
      - 比较`oldfiber.key`和`reactElement.key`(单节点通常不显式设置 key, react 内部会设置成 null)
        - 如 key 相同, 进一步比较`fiber.elementType`与`newChild.type`.
          - 如 type 相同, 调用`useFiber`, 创建`oldFiber.alternate`,并返回
          - 如 type 不同, 调用`createFiber`创建新的`fiber`
        - 如 key 不同, 给`oldFiber`打上`Deletion`标记, 并创建新的`fiber`

2. 可迭代元素(数组类型, [Symbol.iterator]=fn,[@@iterator]=fn)
   1. 进入第一次循环`newChildren: Array<*>`
      - 调用`updateSlot`(与`oldChildren`中相同`index`的`fiber`进行比较), 返回该槽位对应的`fiber`
        - 如 key 相同, 进一步比较`fiber.elementType`与`newChild.type`.
          - 如 type 相同, 调用`useFiber`, 创建`oldFiber.alternate`,并返回
          - 如 type 不同, 调用`createFiber`创建新的`fiber`
        - 如 key 不同, 则返回`null`
      - 调用`placeChild`
        - 设置`newFiber.index`
        - 如`newFiber`是新增节点或者是移动节点,则设置`newFiber.effectTag = Placement`
   2. 如果`oldFiber === null`,则表示`newIdx`之后都为新增节点, 进入第二次循环`newChildren: Array<*>`
      - 调用`createChild`和`placeChild`.创建新节点并设置`newFiber.effectTag = Placement`
   3. 将所有`oldFiber`以 key 为键,添加到一个`Map`中
   4. 进入第三次循环`newChildren: Array<*>`
      - 调用`updateFromMap`,从 map 中寻找`key`相同的`fiber`进行创建`newFiber`
        - 调用`placeChild`
   5. 为`Map`中的旧节点设置删除标记`childToDelete.effectTag = Deletion`

注意:

虽然有三次循环, 但指针都是`newIdx`, 时间复杂度是线性 O(n)

#### completeWork

1. 新增节点
   - 调用渲染器, 同首次 render 一样, 创建`fiber`节点对应的实例.并将子节点`childfiber.stateNode`添加到当前实例中
2. 更新节点
   - 调用`updateXXXComponent`
     - 如属性变化, 将其转换成`dom`属性挂载到`workInProgress.updateQueue`中, 并打上 update 标记
     - 如属性没有变化, 退出调用

#### completeUnitOfWork

把子节点和当前节点的`effects`上移到父节点,更新父节点的`effects`队列

#### commitWork

和首次 render 完全一样, 分为 3 个阶段, 最后完全更到 dom 对象, 页面呈现.

## effects
