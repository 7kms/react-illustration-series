---
title: context 原理
group: 状态管理
order: 4
---

# React Context 原理

简单来讲, `Context`提供了一种直接访问祖先节点上的状态的方法, 避免了多级组件层层传递`props`.

有关`Context`的用法, 请直接查看官方文档, 本文将从`fiber树构造`的视角, 分析`Context`的实现原理.

## 创建 Context

根据官网示例, 通过`React.createContext`这个 api 来创建`context`对象. 在[createContext](https://github.com/facebook/react/blob/v17.0.2/packages/react/src/ReactContext.js#L14-L152)中, 可以看到`context`对象的数据结构:

```js
export function createContext<T>(
  defaultValue: T,
  calculateChangedBits: ?(a: T, b: T) => number,
): ReactContext<T> {
  if (calculateChangedBits === undefined) {
    calculateChangedBits = null;
  }
  const context: ReactContext<T> = {
    $$typeof: REACT_CONTEXT_TYPE,
    _calculateChangedBits: calculateChangedBits,
    // As a workaround to support multiple concurrent renderers, we categorize
    // some renderers as primary and others as secondary. We only expect
    // there to be two concurrent renderers at most: React Native (primary) and
    // Fabric (secondary); React DOM (primary) and React ART (secondary).
    // Secondary renderers store their context values on separate fields.
    _currentValue: defaultValue,
    _currentValue2: defaultValue,
    _threadCount: 0,
    Provider: (null: any),
    Consumer: (null: any),
  };

  context.Provider = {
    $$typeof: REACT_PROVIDER_TYPE,
    _context: context,
  };
  context.Consumer = context;
  return context;
}
```

`createContext`核心逻辑:

- 其初始值保存在`context._currentValue`(同时保存到`context._currentValue2`. 英文注释已经解释, 保存 2 个 value 是为了支持多个渲染器并发渲染)
- 同时创建了`context.Provider`, `context.Consumer`2 个`reactElement`对象.

比如, 创建`const MyContext = React.createContext(defaultValue);`, 之后使用`<MyContext.Provider value={/* 某个值 */}>`声明一个`ContextProvider`类型的组件.

在`fiber树渲染`时, 在`beginWork`中`ContextProvider`类型的节点对应的处理函数是[updateContextProvider](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberBeginWork.old.js#L2842-L2898):

```js
function beginWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
): Fiber | null {
  const updateLanes = workInProgress.lanes;
  workInProgress.lanes = NoLanes;
  // ...省略无关代码
  switch (workInProgress.tag) {
    case ContextProvider:
      return updateContextProvider(current, workInProgress, renderLanes);
    case ContextConsumer:
      return updateContextConsumer(current, workInProgress, renderLanes);
  }
}

function updateContextProvider(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
) {
  // ...省略无关代码
  const providerType: ReactProviderType<any> = workInProgress.type;
  const context: ReactContext<any> = providerType._context;

  const newProps = workInProgress.pendingProps;
  const oldProps = workInProgress.memoizedProps;
  // 接收新value
  const newValue = newProps.value;

  // 更新 ContextProvider._currentValue
  pushProvider(workInProgress, newValue);

  if (oldProps !== null) {
    // ... 省略更新context的逻辑, 下文讨论
  }

  const newChildren = newProps.children;
  reconcileChildren(current, workInProgress, newChildren, renderLanes);
  return workInProgress.child;
}
```

`updateContextProvider()`在`fiber初次创建`时十分简单, 仅仅就是保存了`pendingProps.value`做为`context`的最新值, 之后这个最新的值用于供给消费.

### context.\_currentValue 存储

注意`updateContextProvider -> pushProvider`中的[pushProvider(workInProgress, newValue)](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberNewContext.old.js#L75-L113):

```js
// ...省略无关代码
export function pushProvider<T>(providerFiber: Fiber, nextValue: T): void {
  const context: ReactContext<T> = providerFiber.type._context;
  push(valueCursor, context._currentValue, providerFiber);
  context._currentValue = nextValue;
}
```

`pushProvider`实际上是一个存储函数, 利用`栈`的特性, 先把`context._currentValue`压栈, 之后更新`context._currentValue = nextValue`.

与`pushProvider`对应的还有[popProvider](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberNewContext.old.js#L115-L126), 同样利用`栈`的特性, 把`栈`中的值弹出, 还原到`context._currentValue`中.

本节重点分析`Context Api`在`fiber树构造`过程中的作用. 有关`pushProvider/popProvider`的具体实现过程(栈存储), 在[React 算法之栈操作](../algorithm/stack.md#context)中有详细图解.

## 消费 Context

使用了`MyContext.Provider`组件之后, 在`fiber树构造`过程中, context 的值会被`ContextProvider`类型的`fiber`节点所更新. 在后续的过程中, 如何读取`context._currentValue`?

在`react`中, 共提供了 3 种方式可以消费`Context`:

1. 使用`MyContext.Consumer`组件: 用于`JSX`. 如, `<MyContext.Consumer>(value)=>{}</MyContext.Consumer>`

   - `beginWork`中, 对于`ContextConsumer`类型的节点, 对应的处理函数是[updateContextConsumer](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberBeginWork.old.js#L2902-L2963)

   ```js
   function updateContextConsumer(
     current: Fiber | null,
     workInProgress: Fiber,
     renderLanes: Lanes,
   ) {
     let context: ReactContext<any> = workInProgress.type;
     const newProps = workInProgress.pendingProps;
     const render = newProps.children;

     // 读取context
     prepareToReadContext(workInProgress, renderLanes);
     const newValue = readContext(context, newProps.unstable_observedBits);
     let newChildren;

     // ...省略无关代码
   }
   ```

2. 使用`useContext`: 用于`function`中. 如, `const value = useContext(MyContext)`

   - 进入`updateFunctionComponent`后, 会调用`prepareToReadContext`
   - 无论是初次[创建阶段](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberHooks.old.js#L1780), 还是[更新阶段](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberHooks.old.js#L1801), `useContext`都直接调用了`readContext`

3. `class`组件中, 使用一个静态属性`contextType`: 用于`class`组件中获取`context`. 如, `MyClass.contextType = MyContext;`
   - 进入`updateClassComponent`后, 会调用`prepareToReadContext`
   - 无论[constructClassInstance](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberClassComponent.old.js#L573),[mountClassInstance](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberClassComponent.old.js#L807), [updateClassInstance](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberClassComponent.old.js#L1031)内部都调用`context = readContext((contextType: any));`

所以这 3 种方式只是`react`根据不同使用场景封装的`api`, 内部都会调用[prepareToReadContext](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberNewContext.old.js#L297-L317)和[readContext(contextType)](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberNewContext.old.js#L319-L381).

```js
// ... 省略无关代码
export function prepareToReadContext(
  workInProgress: Fiber,
  renderLanes: Lanes,
): void {
  // 1. 设置全局变量, 为readContext做准备
  currentlyRenderingFiber = workInProgress;
  lastContextDependency = null;
  lastContextWithAllBitsObserved = null;

  const dependencies = workInProgress.dependencies;
  if (dependencies !== null) {
    const firstContext = dependencies.firstContext;
    if (firstContext !== null) {
      if (includesSomeLane(dependencies.lanes, renderLanes)) {
        // Context list has a pending update. Mark that this fiber performed work.
        markWorkInProgressReceivedUpdate();
      }
      // Reset the work-in-progress list
      dependencies.firstContext = null;
    }
  }
}
// ... 省略无关代码
export function readContext<T>(
  context: ReactContext<T>,
  observedBits: void | number | boolean,
): T {
  const contextItem = {
    context: ((context: any): ReactContext<mixed>),
    observedBits: resolvedObservedBits,
    next: null,
  };
  // 1. 构造一个contextItem, 加入到 workInProgress.dependencies链表之后
  if (lastContextDependency === null) {
    lastContextDependency = contextItem;
    currentlyRenderingFiber.dependencies = {
      lanes: NoLanes,
      firstContext: contextItem,
      responders: null,
    };
  } else {
    lastContextDependency = lastContextDependency.next = contextItem;
  }
  // 2. 返回 currentValue
  return isPrimaryRenderer ? context._currentValue : context._currentValue2;
}
```

核心逻辑:

1. `prepareToReadContext`: 设置`currentlyRenderingFiber = workInProgress`, 并重置`lastContextDependency`等全局变量.
2. `readContext`: 返回`context._currentValue`, 并构造一个`contextItem`添加到`workInProgress.dependencies`链表之后.

注意: 这个`readContext`并不是纯函数, 它还有一些副作用, 会更改`workInProgress.dependencies`, 其中`contextItem.context`保存了当前`context`的引用. 这个`dependencies`属性会在更新时使用, 用于判定是否依赖了`ContextProvider`中的值.

返回`context._currentValue`之后, 之后继续进行`fiber树构造`直到全部完成即可.

## 更新 Context

来到更新阶段, 同样进入`updateContextConsumer`

```js
function updateContextProvider(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
) {
  const providerType: ReactProviderType<any> = workInProgress.type;
  const context: ReactContext<any> = providerType._context;

  const newProps = workInProgress.pendingProps;
  const oldProps = workInProgress.memoizedProps;

  const newValue = newProps.value;

  pushProvider(workInProgress, newValue);

  if (oldProps !== null) {
    // 更新阶段进入
    const oldValue = oldProps.value;
    // 对比 newValue 和 oldValue
    const changedBits = calculateChangedBits(context, newValue, oldValue);
    if (changedBits === 0) {
      // value没有变动, 进入 Bailout 逻辑
      if (
        oldProps.children === newProps.children &&
        !hasLegacyContextChanged()
      ) {
        return bailoutOnAlreadyFinishedWork(
          current,
          workInProgress,
          renderLanes,
        );
      }
    } else {
      // value变动, 查找对应的consumers, 并使其能够被更新
      propagateContextChange(workInProgress, context, changedBits, renderLanes);
    }
  }
  // ... 省略无关代码
}
```

核心逻辑:

1. `value`没有改变, 直接进入`Bailout`(可以回顾[fiber 树构造(对比更新)](./fibertree-update.md#bailout)中对`bailout`的解释).
2. `value`改变, 调用`propagateContextChange`

[propagateContextChange](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberNewContext.old.js#L182-L295):

```js
export function propagateContextChange(
  workInProgress: Fiber,
  context: ReactContext<mixed>,
  changedBits: number,
  renderLanes: Lanes,
): void {
  let fiber = workInProgress.child;
  if (fiber !== null) {
    // Set the return pointer of the child to the work-in-progress fiber.
    fiber.return = workInProgress;
  }
  while (fiber !== null) {
    let nextFiber;
    const list = fiber.dependencies;
    if (list !== null) {
      nextFiber = fiber.child;
      let dependency = list.firstContext;
      while (dependency !== null) {
        // 检查 dependency中依赖的context
        if (
          dependency.context === context &&
          (dependency.observedBits & changedBits) !== 0
        ) {
          // 符合条件, 安排调度
          if (fiber.tag === ClassComponent) {
            // class 组件需要创建一个update对象, 添加到updateQueue队列
            const update = createUpdate(
              NoTimestamp,
              pickArbitraryLane(renderLanes),
            );
            update.tag = ForceUpdate; // 注意ForceUpdate, 保证class组件一定执行render
            enqueueUpdate(fiber, update);
          }
          fiber.lanes = mergeLanes(fiber.lanes, renderLanes);
          const alternate = fiber.alternate;
          if (alternate !== null) {
            alternate.lanes = mergeLanes(alternate.lanes, renderLanes);
          }
          // 向上
          scheduleWorkOnParentPath(fiber.return, renderLanes);

          // 标记优先级
          list.lanes = mergeLanes(list.lanes, renderLanes);

          // 退出查找
          break;
        }
        dependency = dependency.next;
      }
    }

    // ...省略无关代码
    // ...省略无关代码

    fiber = nextFiber;
  }
}
```

`propagateContextChange`源码比较长, 核心逻辑如下:

1. 向下遍历: 从`ContextProvider`类型的节点开始, 向下查找所有`fiber.dependencies`依赖该`context`的节点(假设叫做`consumer`).
2. 向上遍历: 从`consumer`节点开始, 向上遍历, 修改父路径上所有节点的`fiber.childLanes`属性, 表明其子节点有改动, 子节点会进入更新逻辑.

   - 这一步通过调用[scheduleWorkOnParentPath(fiber.return, renderLanes)](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberNewContext.old.js#L155-L180)实现.

     ```js
     export function scheduleWorkOnParentPath(
       parent: Fiber | null,
       renderLanes: Lanes,
     ) {
       // Update the child lanes of all the ancestors, including the alternates.
       let node = parent;
       while (node !== null) {
         const alternate = node.alternate;
         if (!isSubsetOfLanes(node.childLanes, renderLanes)) {
           node.childLanes = mergeLanes(node.childLanes, renderLanes);
           if (alternate !== null) {
             alternate.childLanes = mergeLanes(
               alternate.childLanes,
               renderLanes,
             );
           }
         } else if (
           alternate !== null &&
           !isSubsetOfLanes(alternate.childLanes, renderLanes)
         ) {
           alternate.childLanes = mergeLanes(alternate.childLanes, renderLanes);
         } else {
           // Neither alternate was updated, which means the rest of the
           // ancestor path already has sufficient priority.
           break;
         }
         node = node.return;
       }
     }
     ```

   - `scheduleWorkOnParentPath`与[markUpdateLaneFromFiberToRoot](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L625-L667)的作用相似, 具体可以回顾[fiber 树构造(对比更新)](./fibertree-update.md#markUpdateLaneFromFiberToRoot)

通过以上 2 个步骤, 保证了所有消费该`context`的子节点都会被重新构造, 进而保证了状态的一致性, 实现了`context`更新.

## 总结

`Context`的实现思路还是比较清晰, 总体分为 2 步.

1. 在消费状态时,`ContextConsumer`节点调用`readContext(MyContext)`获取最新状态.
2. 在更新状态时, 由`ContextProvider`节点负责查找所有`ContextConsumer`节点, 并设置消费节点的父路径上所有节点的`fiber.childLanes`, 保证消费节点可以得到更新.
