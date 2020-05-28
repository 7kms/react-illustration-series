---
title: setState
desc: React中, setState是同步还是异步
order: 1
---

# React 中, setState 是同步还是异步

所谓同步还是异步指的是调用 setState 之后是否马上能得到最新的 state

不仅仅是`setState`了, 在对 function 类型组件中的 hook 进行操作时也是一样, 最终决定`setState`是同步渲染还是异步渲染的关键因素是`ReactFiberWorkLoop`工作空间的执行上下文.

具体代码如下:

```js
export function scheduleUpdateOnFiber(
  fiber: Fiber,
  expirationTime: ExpirationTime,
) {
  const priorityLevel = getCurrentPriorityLevel();

  if (expirationTime === Sync) {
    if (
      // Check if we're inside unbatchedUpdates
      (executionContext & LegacyUnbatchedContext) !== NoContext &&
      // Check if we're not already rendering
      (executionContext & (RenderContext | CommitContext)) === NoContext
    ) {
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

可以看到, 是否同步渲染调度决定代码是`flushSyncCallbackQueue()`. 进入该分支的条件:

1. 必须是`legacy模式`, `concurrent`模式下`expirationTime`不会为`Sync`
2. `executionContext === NoContext`, 执行上下文必须要为空.

两个条件缺一不可.

## 结论

同步:

1. 首先在`legacy模式`下
2. 在执行上下文为空的时候去调用`setState`
   - 可以使用异步调用如`setTimeout`, `Promise`, `MessageChannel`等
   - 可以监听原生事件, 注意不是合成事件, 在原生事件的回调函数中执行 setState 就是同步的

异步:

1. 如果是合成事件中的回调, `executionContext |= DiscreteEventContext`, 所以不会进入, 最终表现出异步
2. concurrent 模式下都为异步

## 演示示例

```jsx
import React from 'react';

export default class App extends React.Component {
  state = {
    count: 0,
  };

  changeState = () => {
    const newCount = this.state.count + 1;
    this.setState({
      count: this.state.count + 1,
    });
    if (newCount === this.state.count) {
      console.log('同步执行render');
    } else {
      console.log('异步执行render');
    }
  };

  changeState2 = () => {
    const newCount = this.state.count + 1;
    Promise.resolve().then(() => {
      this.setState({
        count: this.state.count + 1,
      });
      if (newCount === this.state.count) {
        console.log('同步执行render');
      } else {
        console.log('异步执行render');
      }
    });
  };

  render() {
    return (
      <div>
        <p>当前count={this.state.count}</p>
        <button onClick={this.changeState}>异步+1</button>
        <button onClick={this.changeState2}>同步+1</button>
      </div>
    );
  }
}
```

在看一个 concurrent 模式下的例子, 相同的代码都为异步 render:

[![Edit boring-faraday-m7jtx](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/boring-faraday-m7jtx?fontsize=14&hidenavigation=1&theme=dark)
