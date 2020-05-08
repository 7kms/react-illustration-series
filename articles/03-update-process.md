# react更新流程

正常react应用有2种主动更新方式:

1. `Class`组件中主动调用`setState`.
2. `Function`组件中使用`hook`对象的`dispatchAction`.
3. 改变`context`

### setState

继续使用[首次render](./02-render-process.md)中的例子.

定义`<App/>`组件的结构如下:

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

在初次`render`结束后, 工作空间的主要变量的状态如下:

![](../snapshots/firstrender-workloop-03.png)

点击`<Box/>`组件中的`button`, 触发`setState`. 跟踪`setState`函数的调用栈:

在`Component`对象的原型中有:

```js
Component.prototype.setState = function(partialState, callback) {
  this.updater.enqueueSetState(this, partialState, callback, 'setState');
};
```

在[首次render](./02-render-process.md#render阶段)中的`beginWork`函数中, class类型的组件初始化完成之后, `this.updater`对象如下:

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
  }
}
```



