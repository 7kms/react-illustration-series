---
nav:
  title: 原理解析

title: 初始化
order: 1
---

# React 应用初始化

## 3 种启动模式

在当前稳定版`react@16.13.1`源码中, 有 3 种启动方式. 先引出官网上对于[这 3 种模式的介绍](https://zh-hans.reactjs.org/docs/concurrent-mode-adoption.html#why-so-many-modes), 其基本说明如下:

- `legacy` 模式: `ReactDOM.render(<App />, rootNode)`. 这是当前 React app 使用的方式. 这个模式可能不支持[这些新功能(concurrent 支持的所有功能)](https://zh-hans.reactjs.org/docs/concurrent-mode-patterns.html#the-three-steps).
- `blocking` 模式: `ReactDOM.createBlockingRoot(rootNode).render(<App />)`. 目前正在实验中, 它仅提供了 `concurrent` 模式的小部分功能, 作为迁移到 `concurrent` 模式的第一个步骤.
- `concurrent` 模式: `ReactDOM.createRoot(rootNode).render(<App />)`. 目前在实验中, 未来稳定之后，打算作为 React 的默认开发模式. 这个模式开启了所有的新功能.

1. `Legacy`模式

```js
// LegacyRoot
ReactDOM.render(<App />, document.getElementById('root'), dom => {}); // 支持callback回调, 参数是一个dom对象
```

2. [`Concurrent`模式](https://zh-hans.reactjs.org/docs/concurrent-mode-adoption.html#enabling-concurrent-mode)

```js
// ConcurrentRoot
// 1. 创建ReactDOMRoot对象
const reactDOMRoot = ReactDOM.createRoot(document.getElementById('root'));
// 2. 调用render
reactDOMRoot.render(<App />); // 不支持回调
```

3. [`Blocking`模式](https://zh-hans.reactjs.org/docs/concurrent-mode-adoption.html#migration-step-blocking-mode): 做为`Legacy`和`Concurrent`之间的过度

```js
// BolckingRoot
// 1. 创建ReactDOMRoot对象
const reactDOMBolckingRoot = ReactDOM.createBlockingRoot(
  document.getElementById('root'),
);
// 2. 调用render
reactDOMBolckingRoot.render(<App />); // 不支持回调
```

注意: 虽然`16.13.1`的源码中有[`createRoot`和`createBlockingRoot`方法](https://github.com/facebook/react/blob/v16.13.1/packages/react-dom/src/client/ReactDOM.js#L209), 但是实际在`npm i react-dom`安装`16.13.1`版本后, 却没有这两个方法(可能是构建过程中去掉了).如果要想体验非`legacy`模式, 需要[显示安装实验版本](https://zh-hans.reactjs.org/docs/concurrent-mode-adoption.html#installation).

## 初始化流程

在`react`正式调用之前,`reactElement(<App/>)`和 DOM 对象`div#root`之间没有关联, 用图片表示如下:

![](../../snapshots/bootstrap/process-before.png)

### 创建全局对象

无论`Legacy, Concurrent或Blocking`模式, react 在初始化时, 都会创建 3 个全局对象

1. `ReactDOM(Blocking)Root`对象
2. `fiberRoot`对象
3. `HostRootFiber` 对象

这 3 个对象是 react 体系得以运行的基本保障, 一经创建大多数场景不会再销毁(除非卸载整个应用`root.unmount()`).

这一步骤涉及到`react-dom`和`react-reconciler`两个包, 核心流程图如下(其中红色标注了 3 个对象的创建时机).

![](../../snapshots/bootstrap/function-call.png)

下面逐一解释这 3 个对象的创建过程.

#### 创建 ReactDOM(Blocking)Root 对象

##### legacy 模式

`legacy`模式表面上是直接调用`ReactDOM.render`, 跟踪`ReactDOM.render`实际上调用`legacyRenderSubtreeIntoContainer`

```js
function legacyRenderSubtreeIntoContainer(
  parentComponent: ?React$Component<any, any>,
  children: ReactNodeList,
  container: Container,
  forceHydrate: boolean,
  callback: ?Function,
) {
  let root: RootType = (container._reactRootContainer: any);
  let fiberRoot;
  if (!root) {
    // 初次调用, root还未初始化, 会进入此分支
    //1. 创建ReactDOMRoot对象, 初始化react应用环境
    root = container._reactRootContainer = legacyCreateRootFromDOMContainer(
      container,
      forceHydrate,
    );
    fiberRoot = root._internalRoot;
    if (typeof callback === 'function') {
      const originalCallback = callback;
      callback = function() {
        // instance最终指向 children(入参: 如<App/>)生成的dom节点
        const instance = getPublicRootInstance(fiberRoot);
        originalCallback.call(instance);
      };
    }
    // 2. 更新容器
    unbatchedUpdates(() => {
      updateContainer(children, fiberRoot, parentComponent, callback);
    });
  } else {
    // root已经初始化, 二次调用render会进入
    // 1. 获取ReactDOMRoot对象
    fiberRoot = root._internalRoot;
    if (typeof callback === 'function') {
      const originalCallback = callback;
      callback = function() {
        const instance = getPublicRootInstance(fiberRoot);
        originalCallback.call(instance);
      };
    }
    // 2. 调用更新
    updateContainer(children, fiberRoot, parentComponent, callback);
  }
  return getPublicRootInstance(fiberRoot);
}
```

继续跟踪`legacyCreateRootFromDOMContainer`. 最后调用`new ReactDOMBlockingRoot(container, LegacyRoot, options);`

```js
function legacyCreateRootFromDOMContainer(
  container: Container,
  forceHydrate: boolean,
): RootType {
  const shouldHydrate =
    forceHydrate || shouldHydrateDueToLegacyHeuristic(container);
  return createLegacyRoot(
    container,
    shouldHydrate
      ? {
          hydrate: true,
        }
      : undefined,
  );
}

export function createLegacyRoot(
  container: Container,
  options?: RootOptions,
): RootType {
  return new ReactDOMBlockingRoot(container, LegacyRoot, options); // 注意这里的LegacyRoot是固定的, 并不是外界传入的
}
```

通过以上分析,`legacy`模式下调用`ReactDOM.render`有 2 个核心步骤:

1. 创建`ReactDOMBlockingRoot`实例(在 Concurrent 模式和 Blocking 模式中详细分析该类), 初始化 react 应用环境
2. 调用`updateContainer`进行更新

##### Concurrent 模式和 Blocking 模式

`Concurrent`模式和`Blocking`模式从调用方式上直接可以看出

1. 分别调用`ReactDOM.createRoot`和`ReactDOM.createBlockingRoot`创建`ReactDOMRoot`和`ReactDOMBlockingRoot`实例
2. 调用`ReactDOMRoot`和`ReactDOMBlockingRoot`实例的`render`方法

```js
export function createRoot(
  container: Container,
  options?: RootOptions,
): RootType {
  return new ReactDOMRoot(container, options);
}

export function createBlockingRoot(
  container: Container,
  options?: RootOptions,
): RootType {
  return new ReactDOMBlockingRoot(container, BlockingRoot, options); // 注意这里的BlockingRoot是固定的, 并不是外界传入的
}
```

继续查看`ReactDOMRoot`和`ReactDOMBlockingRoot`对象

```js
function ReactDOMRoot(container: Container, options: void | RootOptions) {
  // 创建一个fiberRoot对象, 并将其挂载到this._internalRoot之上
  this._internalRoot = createRootImpl(container, ConcurrentRoot, options);
}
function ReactDOMBlockingRoot(
  container: Container,
  tag: RootTag,
  options: void | RootOptions,
) {
  // 创建一个fiberRoot对象, 并将其挂载到this._internalRoot之上
  this._internalRoot = createRootImpl(container, tag, options);
}

ReactDOMRoot.prototype.render = ReactDOMBlockingRoot.prototype.render = function(
  children: ReactNodeList,
): void {
  const root = this._internalRoot;
  // 执行更新
  updateContainer(children, root, null, null);
};

ReactDOMRoot.prototype.unmount = ReactDOMBlockingRoot.prototype.unmount = function(): void {
  const root = this._internalRoot;
  const container = root.containerInfo;
  // 执行更新
  updateContainer(null, root, null, () => {
    unmarkContainerAsRoot(container);
  });
};
```

`ReactDOMRoot`和`ReactDOMBlockingRoot`有相同的特性

1. 调用`createRootImpl`创建`fiberRoot`对象, 并将其挂载到`this._internalRoot`上
2. 原型上有`render`和`umount`方法
   - 内部都会执行`updateContainer`进行更新

---

到这里可以说明, 3 种模式虽然调用的入口函数不同, 但是其核心步骤都是一致的.

#### 创建 fiberRoot 对象

`ReactDOM(Blocking)Root`的创建过程中, 都有相同的调用:

```js
// 注意: 3种模式下的tag是各不相同(分别是ConcurrentRoot,BlockingRoot,LegacyRoot).
this._internalRoot = createRootImpl(container, tag, options);
```

```js
function createRootImpl(
  container: Container,
  tag: RootTag,
  options: void | RootOptions,
) {
  // Tag is either LegacyRoot or Concurrent Root
  const hydrate = options != null && options.hydrate === true;
  const hydrationCallbacks =
    (options != null && options.hydrationOptions) || null;
  // 1. 创建fiberRoot
  const root = createContainer(container, tag, hydrate, hydrationCallbacks);
  // 2. 标记dom对象, 把dom和fiber对象关联起来
  markContainerAsRoot(root.current, container);
  // ...省略部分无关代码
  return root;
}
```

```js
export function createContainer(
  containerInfo: Container,
  tag: RootTag,
  hydrate: boolean,
  hydrationCallbacks: null | SuspenseHydrationCallbacks,
): OpaqueRoot {
  return createFiberRoot(containerInfo, tag, hydrate, hydrationCallbacks);
}
```

#### 创建 HostRootFiber 对象

在`createFiberRoot`中, 创建了`react`应用的首个`fiber`对象, 称为`HostRootFiber(fiber.tag = HostRoot)`

```js
export function createFiberRoot(
  containerInfo: any,
  tag: RootTag,
  hydrate: boolean,
  hydrationCallbacks: null | SuspenseHydrationCallbacks,
): FiberRoot {
  const root: FiberRoot = (new FiberRootNode(containerInfo, tag, hydrate): any);
  if (enableSuspenseCallback) {
    root.hydrationCallbacks = hydrationCallbacks;
  }
  // 1. 这里创建了`react`应用的首个`fiber`对象, 称为`HostRootFiber`
  const uninitializedFiber = createHostRootFiber(tag);
  root.current = uninitializedFiber;
  uninitializedFiber.stateNode = root;
  // 2. 初始化HostRootFiber的updateQueue
  initializeUpdateQueue(uninitializedFiber);

  return root;
}
```

在创建`HostRootFiber`时, 其中`fiber.mode`属性, 会与 3 种`RootTag`(`ConcurrentRoot`,`BlockingRoot`,`LegacyRoot`)关联起来.

```js
export function createHostRootFiber(tag: RootTag): Fiber {
  let mode;
  if (tag === ConcurrentRoot) {
    mode = ConcurrentMode | BlockingMode | StrictMode;
  } else if (tag === BlockingRoot) {
    mode = BlockingMode | StrictMode;
  } else {
    mode = NoMode;
  }
  return createFiber(HostRoot, null, null, mode); // 注意这里设置的mode属性是由RootTag决定的
}
```

注意:`fiber`树中所节点的`mode`都会和`HostRootFiber.mode`一致(新建的 fiber 节点, 其 mode 来源于父节点),所以**HostRootFiber.mode**非常重要, 它决定了以后整个 fiber 树构建过程.

将此刻内存中各个对象的引用情况表示出来:

1. lagacy

![](../../snapshots/bootstrap/process-legacy.png)

2. concurrent

![](../../snapshots/bootstrap/process-concurrent.png)

3. blocking

![](../../snapshots/bootstrap/process-blocking.png)

注意:

1. 3 种模式下,`HostRootFiber.mode`是不一致的
2. legacy 下, `div#root`和`ReactDOMBlockingRoot`之间通过`_reactRootContainer`关联. 其他模式是没有关联的
3. 此时`reactElement(<App/>)`还是独立在外的, 还没有和目前创建的 3 个全局对象关联起来

#### fiber.updateQueue

在 fiber 数据结构中, 有一个`updateQueue`属性. 在创建`HostRootFiber`的同时`HostRootFiber.updateQueue`也已经初始化完成了.

`updateQueue`队列的作用是用来记录该 fiber 对象的更新操作, 在 fiber 节点更新中会用到(此处先了解, 在组件更新章节中详细解释).

![](../../snapshots/bootstrap/update-queue.png)

运行到这里, `react`应用的初始化已经完成了.

## 调用更新入口

1. lagacy
   回到`legacyRenderSubtreeIntoContainer`函数中有:

```js
// 2. 更新容器
unbatchedUpdates(() => {
  updateContainer(children, fiberRoot, parentComponent, callback);
});
```

2. concurrent 和 blocking
   在`ReactDOM(Blocking)Root`原型上有`render`方法

```js
ReactDOMRoot.prototype.render = ReactDOMBlockingRoot.prototype.render = function(
  children: ReactNodeList,
): void {
  const root = this._internalRoot;
  // 执行更新
  updateContainer(children, root, null, null);
};
```

相同点:

1. 3 种模式在调用更新时都会执行`updateContainer`,由`updateContainer`来引导更新

不同点:

1. `legacy`下的更新会先调用`unbatchedUpdates`, 更改执行上下文为`LegacyUnbatchedContext`, 之后调用`updateContainer`进行更新.

2. `concurrent`和`blocking`不会更改执行上下文, 直接调用`updateContainer`进行更新.

对于`updateContainer`的深入分析, 在[fiber 构建(新增节点)](./render.md)和[fiber 构建(更新节点)](./update.md)中详细讨论. 此处先要明确`react`应用的初始化完成之后便可以通过调用`updateContainer`执行更新.

## 可中断渲染

react 中最广为人知的可中断渲染(render 可以中断, 部分生命周期函数有可能执行多次, `UNSAFE_componentWillMount`,`UNSAFE_componentWillReceiveProps`)只有在`HostRootFiber.mode === ConcurrentRoot | BlockingRoot`才会开启. 如果使用的是`legacy`, 即通过`ReactDOM.render(<App/>, dom)`这种方式启动时`HostRootFiber.mode = NoMode`, 这种情况下无论是首次 render 还是后续 update 都只会进入同步工作循环, `reconciliation`没有机会中断, 所以生命周期函数只会调用一次.

### 思考

对于`可中断渲染`的宣传最早来自[2017 年 Lin Clark 的演讲](http://conf2017.reactjs.org/speakers/lin). 演讲中阐述了未来 react 会应用 fiber 架构, `reconciliation可中断`等(13:15 秒). 在[`v16.1.0`](https://github.com/facebook/react/blob/master/CHANGELOG.md#1610-november-9-2017)中应用了 fiber.

在最新稳定版[`v16.13.1`](https://github.com/facebook/react/blob/master/CHANGELOG.md#16131-march-19-2020)中, `可中断渲染`虽然实现, 但是并没有暴露出 api. 只能[安装实验版本](https://zh-hans.reactjs.org/docs/concurrent-mode-adoption.html#installation)才能体验该特性.

但是很多开发人员都认为自己使用的`react`就是可中断渲染(都认为不安全的生命周期会执行多次, 误区很大), 大概率也是受到了各类宣传文章的影响.

前端大环境还是比较浮躁的, 在当下, 应该静下心来脚踏实地的学习.
