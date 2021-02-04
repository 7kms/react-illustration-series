---
title: fiber 树构造(对比更新)
---

# fiber 树构造(对比更新)

在前文[fiber 树构造(初次创建)](./fibertree-create.md)一文的介绍中, 演示了`fiber树构造循环`中逐步构造`fiber树`的过程. 由于是初次创建, 所以在构造过程中, 所有节点都是新建, 并没有复用旧节点.

本节只讨论`对比更新`这种情况, 与前文[fiber 树构造(初次创建)](./fibertree-create.md)都在`Legacy`模式下进行分析.

本节示例代码如下([codesandbox 地址](https://codesandbox.io/s/angry-williams-l1mze?file=/src/App.js)):

```js
class App extends React.Component {
  componentDidMount() {
    console.log(`App Mount`);
  }
  render() {
    return (
      <div className="app">
        <header>header</header>
        <Content />
      </div>
    );
  }
}

function Content() {
  const [list, setList] = useState(['A', 'B', 'C']);
  const onClick = useCallback(() => {
    setList(['B', 'X', 'Y']);
  }, []);
  return (
    <>
      <div className="content">
        {list.map(item => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <div className="operate">
        <button onClick={onClick}>change</button>
      </div>
    </>
  );
}
export default App;
```

## 更新入口

前文[reconciler 运作流程](./reconciler-workflow.md#输入)中总结的 4 个阶段(从输入到输出), 其中承接输入的函数只有`scheduleUpdateOnFiber`[源码地址](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L517-L619).在`react-reconciler`对外暴露的 api 函数中, 只要涉及到需要改变 fiber 的操作(无论是`首次渲染`或`后续更新`操作), 最后都会间接调用`scheduleUpdateOnFiber`, `scheduleUpdateOnFiber`函数是输入链路中的`必经之路`.

### 3 种更新方式

如要主动发起更新, 有 3 种常见方式:

1. `Class`组件中调用`setState`.
2. `Function`组件中调用`hook`对象暴露出的`dispatchAction`.
3. 在`container`节点上重复调用`render`([官网示例](https://reactjs.org/docs/rendering-elements.html#react-only-updates-whats-necessary))

下面列举这 3 种更新方式的源码:

#### setState

在`Component`对象的原型上挂载有`setState`([源码链接](https://github.com/facebook/react/blob/v17.0.1/packages/react/src/ReactBaseClasses.js#L57-L66)):

```js
Component.prototype.setState = function(partialState, callback) {
  this.updater.enqueueSetState(this, partialState, callback, 'setState');
};
```

在[fiber 树构造(初次创建)](./fibertree-create.md)中的`beginWork`阶段, class 类型的组件初始化完成之后, `this.updater`对象如下([源码链接](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberClassComponent.old.js#L193-L225)):

```js
const classComponentUpdater = {
  isMounted,
  enqueueSetState(inst, payload, callback) {
    // 1. 获取class实例对应的fiber节点
    const fiber = getInstance(inst);
    // 2. 创建update对象
    const eventTime = requestEventTime();
    const lane = requestUpdateLane(fiber); // 确定当前update对象的优先级
    const update = createUpdate(eventTime, lane);
    update.payload = payload;
    if (callback !== undefined && callback !== null) {
      update.callback = callback;
    }
    // 3. 将update对象添加到当前Fiber节点的updateQueue队列当中
    enqueueUpdate(fiber, update);
    // 4. 进入reconcier运作流程中的`输入`环节
    scheduleUpdateOnFiber(fiber, lane, eventTime);
  },
};
```

#### dispatchAction

> 此处只是为了对比`dispatchAction`和`setState`. 对于`hook`对象的详细分析, 在`hook 原理`章节中详细讨论.

在`function类型`组件中, 如果使用`hook`, 则可以通过`hook api`暴露出的`dispatchAction`([源码链接](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberHooks.old.js#L1645-L1753))来更新

```js
function dispatchAction<S, A>(
  fiber: Fiber,
  queue: UpdateQueue<S, A>,
  action: A,
) {
  // 1. 创建update对象
  const eventTime = requestEventTime();
  const lane = requestUpdateLane(fiber); // 确定当前update对象的优先级
  const update: Update<S, A> = {
    lane,
    action,
    eagerReducer: null,
    eagerState: null,
    next: (null: any),
  };
  // 2. 将update对象添加到当前Fiber节点的updateQueue队列当中
  const pending = queue.pending;
  if (pending === null) {
    update.next = update;
  } else {
    update.next = pending.next;
    pending.next = update;
  }
  queue.pending = update;
  // 3. 进入reconcier运作流程中的`输入`环节
  scheduleUpdateOnFiber(fiber, lane, eventTime);
}
```

#### 重复调用 render

```js
import ReactDOM from 'react-dom';
function tick() {
  const element = (
    <div>
      <h1>Hello, world!</h1>
      <h2>It is {new Date().toLocaleTimeString()}.</h2>
    </div>
  );
  ReactDOM.render(element, document.getElementById('root'));
}
setInterval(tick, 1000);
```

对于重复`render`, 在[React 应用的启动过程](./bootstrap.md)中已有说明, 最后会调用`scheduleUpdateOnFiber`

> 所以无论从哪个入口进行更新, 最终都会进入`scheduleUpdateOnFiber`.

由于本示例中使用了`function组件`中的`hook api`, 所以更新入口是`dispatchAction`. 接下来进入`scheduleUpdateOnFiber`函数.

## 构造阶段

于初次渲染一样, 逻辑来到了[scheduleUpdateOnFiber](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L517-L619)

```js
// ...省略部分代码
export function scheduleUpdateOnFiber(
  fiber: Fiber,
  lane: Lane,
  eventTime: number,
) {
  const root = markUpdateLaneFromFiberToRoot(fiber, lane);
  if (lane === SyncLane) {
    if (
      (executionContext & LegacyUnbatchedContext) !== NoContext &&
      (executionContext & (RenderContext | CommitContext)) === NoContext
    ) {
      // 初次渲染
      performSyncWorkOnRoot(root);
    } else {
      // 更新渲染
      ensureRootIsScheduled(root, eventTime);
    }
  }
  mostRecentlyUpdatedRoot = root;
}
```

对与本处的逻辑, `更新渲染`与`初次渲染`的不同点:

1. `markUpdateLaneFromFiberToRoot`函数(更新阶段十分重要)用于标记`fiber树`中的`update优先级`(下图解释), 只在`更新渲染`时才体现出它的作用.
2. `更新渲染`没有直接调用`performSyncWorkOnRoot`, 而是通过调度中心来处理(参考[React 调度原理(scheduler)](./scheduler.md)). 由于本示例是在`Legacy`模式下进行, 最后会同步执行`performSyncWorkOnRoot`.

在调用`markUpdateLaneFromFiberToRoot`之前, 此时的内存结构如下:

`markUpdateLaneFromFiberToRoot`的作用:
![](../../snapshots/update/markupdatetime.png)

1. 从当前 fiber 节点开始, 向上查找直到`HostRootFiber`, 标记当前`fiber.lanes`
2. 标记所有父节点(包括 alternate)的`childLanes`
