---
title: 对象与数据结构
---

# React 应用中的数据结构

在 React 应用中, 有很多特定的对象或数据结构. 了解这些内部的设计, 可以更容易理解 react 运行原理.

## 对象

react 的基础包中, 定义了很多内部的对象, 它们贯穿整个 react 运行时.

这里先列举从 react 启动到渲染过程出现频率较高, 影响范围较大的对象.

其他过程的重要对象:

- 如`事件对象`(位于`react-dom/events`保障 react 应用能够响应 ui 交互), 在事件机制章节中详细解读.
- 如`ReactContext, ReactProvider, ReactConsumer`对象, 在 context 机制章节中详细解读.

### react 包

在[宏观结构](./macro-structure.md)中介绍过, 此包定义 react 组件(`ReactElement`)的必要函数, 提供一些操作`ReactElement`对象的 api.

所以这个包的核心需要理解`ReactElement`对象, 假设有如下入口函数:

```js
// 入口函数
ReactDOM.render(<App />, document.getElementById('root'));
```

可以简单的认为, 包括`<App/>`及其所有子节点都是`ReactElement`对象(在 render 之后才会生成子节点, 后文详细解读), 每个`ReactElement`对象的区别在于 type 不同.

#### [`ReactElement`对象](https://github.com/facebook/react/blob/v17.0.1/packages/react/src/ReactElement.js#L126-L146)

> 其 type 定义在[`shared`包中](https://github.com/facebook/react/blob/v17.0.1/packages/shared/ReactElementType.js#L15).

所有采用`jsx`语法书写的节点, 都会被编译器转换, 最终会以`React.createElement(...)`的方式, 创建出来一个与之对应的`ReactElement`对象.

`ReactElement`对象的数据结构如下:

```ts
export type ReactElement = {|
  // 用于辨别ReactElement对象
  $$typeof: any,

  // 内部属性
  type: any, // 表明其种类
  key: any,
  ref: any,
  props: any,

  // ReactFiber 记录创建本对象的Fiber节点, 还未与Fiber树关联之前, 该属性为null
  _owner: any,

  // __DEV__ dev环境下的一些额外信息, 如文件路径, 文件名, 行列信息等
  _store: {validated: boolean, ...},
  _self: React$Element<any>,
  _shadowChildren: any,
  _source: Source,
|};

```

需要特别注意 2 个属性:

1. `key`属性在`reconciler`阶段会用到, 目前只需要知道所有的`ReactElement`对象都有 key 属性(且[其默认值是 null](https://github.com/facebook/react/blob/v17.0.1/packages/react/src/ReactElement.js#L348-L357), 这点十分重要, 在 diff 算法中会使用到).

2. `type`属性决定了节点的种类:

- 它的值可以是字符串(代表`div,span`等 dom 节点), 函数(代表`fuction, class`等节点), 或者 react 内部定义的节点类型(`portal,context,fragment`等)
- 在`reconciler`阶段, 会根据 type 执行不同的逻辑(在 fiber 构建阶段详细解读).
  - 如 type 是一个字符串类型, 则直接使用.
  - 如 type 是一个`ReactComponent`类型, 则会调用其 render 方法获取子节点.
  - 如 type 是一个`function`类型,则会调用该方法获取子节点
  - ...

在`v17.0.1`中, [定义了 20 种](https://github.com/facebook/react/blob/v17.0.1/packages/shared/ReactSymbols.js#L16-L37)内部节点类型. 根据运行时环境不同, 分别采用 16 进制的字面量和`Symbol`进行表示.

#### [`ReactComponent`](https://github.com/facebook/react/blob/v17.0.1/packages/react/src/ReactBaseClasses.js#L20-L30)对象

对于`ReactElement`来讲, `ReactComponent`仅仅是诸多`type`类型中的一种.

对于开发者来讲, `ReactComponent`使用非常高频(在 class 组件和 function 组件章节中详细解读), 在本节只是先证明它只是一种特殊的`ReactElement`.

这里用一个简单的示例, 通过查看编译后的代码来说明

```js
class App extends React.Component {
  render() {
    return (
      <div className="app">
        <header>header</header>
        <Content />
        <footer>footer</footer>
      </div>
    );
  }
}

class Content extends React.Component {
  render() {
    return (
      <React.Fragment>
        <p>1</p>
        <p>2</p>
        <p>3</p>
      </React.Fragment>
    );
  }
}

export default App;
```

编译之后的代码(此处只编译了 jsx 语法, 并没有将 class 语法编译成 es5 中的 fuction), 可以更直观的看出调用逻辑.

`createElement`函数的第一个参数将作为创建`ReactElement`的`type`. 可以看到`Content`这个变量被编译器命名为`App_Content`, 并作为第一个参数(引用传递), 传入了`createElement`.

```js
class App_App extends react_default.a.Component {
  render() {
    return /*#__PURE__*/ react_default.a.createElement(
      'div',
      {
        className: 'app',
      } /*#__PURE__*/,
      react_default.a.createElement('header', null, 'header') /*#__PURE__*/,

      // 此处直接将Content传入, 是一个引用传递
      react_default.a.createElement(App_Content, null) /*#__PURE__*/,
      react_default.a.createElement('footer', null, 'footer'),
    );
  }
}
class App_Content extends react_default.a.Component {
  render() {
    return /*#__PURE__*/ react_default.a.createElement(
      react_default.a.Fragment,
      null /*#__PURE__*/,
      react_default.a.createElement('p', null, '1'),
      /*#__PURE__*/

      react_default.a.createElement('p', null, '2'),
      /*#__PURE__*/

      react_default.a.createElement('p', null, '3'),
    );
  }
}
```

上述示例演示了`ReactComponent`是诸多`ReactElement`种类中的一种情况, 但是由于`ReactComponent`是 class 类型, 自有它的特殊性(可[对照源码](https://github.com/facebook/react/blob/v17.0.1/packages/react/src/ReactBaseClasses.js), 更容易理解).

1. `ReactComponent`是 class 类型, 继承父类`Component`, 拥有特殊的方法(`setState`,`forceUpdate`)和特殊的属性(`context`,`updater`等).
2. 在`reconciler`阶段, 会依据`ReactElement`对象的特征, 生成对应的 fiber 节点. 当识别到`ReactElement`对象是 class 类型的时候, 会触发`ReactComponent` 对象的生命周期, 并调用其 render 方法, 生成`ReactElement`子节点.

#### 其他`ReactElement`

上文介绍了第一种特殊的`ReactElement`(`class`类型的组件), 除此之外`function`类型的组件也需要深入了解, 因为`Hook`只能在`function`类型的组件中使用.

如果在`function`类型的组件中没有使用`Hook`(如: `useState`, `useEffect`等), 在`reconciler`阶段所有有关`Hook`的处理都会略过, 最后调用该`function`拿到子节点`ReactElement`.

如果使用了`Hook`, 逻辑就相对复杂, 涉及到`Hook`创建和状态保存(有关 Hook 的原理部分, 在 Hook 原理章节中详细解读). 此处只需要了解`function`类型的组件和`class`类型的组件一样, 是诸多`ReactElement`形式中的一种.

#### `ReactElement`内存结构

通过前文对`ReactElement`的介绍, 可以比较容易的画出`<App/>`这个`ReactElement`对象在内存中的结构(`reconciler`阶段完成之后才会形成完整的结构).

![](../../snapshots/data-structure/reactelement-tree.png)

注意:

- `class`和`function`类型的组件,其子节点是在 render 之后(`reconciler`阶段)才生成的(随后"同时"生成出`fiber`树, 在 fiber 树构建章节中详细解读). 此处只是单独表示`ReactElement`的数据结构.
- 父级对象和子级对象之间是通过`props.children`属性进行关联的(与 fiber 树不同).
- `ReactElement`虽然不能算是一个严格的树, 也不能算是一个严格的链表. 它的生成过程是至顶向下的, 是所有组件节点的总和.
- `ReactElement`树(暂且用树来表述)和`fiber`树是以`props.children`为单位`先后交替`生成的(在 fiber 树构建章节详细解读), 当`ReactElement`树构造完毕, fiber 树也随后构造完毕.
- `reconciler`阶段会根据`ReactElement`的类型生成对应的`fiber`节点(不是一一对应, 比如`Fragment`类型的组件在生成`fiber`节点的时候会略过).

### `react-reconciler` 包

在[宏观结构](./macro-structure.md)中介绍过, `react-reconciler`包是`react`应用的中枢, 连接渲染器(`react-dom`)和调度中心(`scheduler`), 同时自身也负责 fiber 树的构建.

对于此包的深入分析, 放在`fiber 树构建`, `reconciler 工作空间`等章节中.

此处先要知道`fiber`是核心, react 体系的渲染和更新都要以 fiber 作为数据模型, 如果不能理解 fiber, 也无法深入理解 react.

本章先预览一下此包中与`fiber`高度相关对象的数据结构.

#### Fiber 对象

先看数据结构, 其 type 类型的定义在[`ReactInternalTypes.js`](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactInternalTypes.js#L47-L174)中:

```js
// 一个Fiber是工作在一个即将渲染或者已经渲染的组件之上, 一个组件可能对应多个fiber(current和WorkInProgress)
// 单个属性的解释在后文(在注释中无法添加超链接)
export type Fiber = {|
  tag: WorkTag,
  key: null | string,
  elementType: any,
  type: any,
  stateNode: any,
  return: Fiber | null,
  child: Fiber | null,
  sibling: Fiber | null,
  index: number,
  ref:
    | null
    | (((handle: mixed) => void) & { _stringRef: ?string, ... })
    | RefObject,
  pendingProps: any, // 用于输入的props, 从父节点传入的props,也就是即将使用的props
  memoizedProps: any, // 用于输出的props, 最终渲染所使用的props
  updateQueue: mixed, // 存储state更新的队列, 当前节点的state改动之后, 都会创建一个update对象添加到这个队列中.
  memoizedState: any, // 用于输出的state, 最终渲染所使用的state
  dependencies: Dependencies | null, // 该fiber节点所依赖的(contexts, events)等
  mode: TypeOfMode, // 二进制位Bitfield,继承至父节点,影响本fiber节点及其子树中所有节点. 与react应用的运行模式有关(有ConcurrentMode, BlockingMode, NoMode等选项).

  // Effect 副作用相关
  flags: Flags, // 标志位
  subtreeFlags: Flags, //替代16.x版本中的 firstEffect, nextEffect. 当设置了 enableNewReconciler=true才会启用
  deletions: Array<Fiber> | null, // 存储将要被删除的子节点. 当设置了 enableNewReconciler=true才会启用

  nextEffect: Fiber | null, // 单项链表, 指向下一个有副作用的fiber节点
  firstEffect: Fiber | null, // 指向副作用链表中的第一个fiber节点
  lastEffect: Fiber | null, // 指向副作用链表中的最后一个fiber节点

  // 优先级相关
  lanes: Lanes, // 本fiber节点的优先级
  childLanes: Lanes, // 子节点的优先级
  alternate: Fiber | null, // 指向内存中的另一个fiber, 每个被更新过fiber节点在内存中都是成对出现(current和workInProgress)

  // 性能统计相关(开启enableProfilerTimer后才会统计)
  // react-dev-tool会根据这些时间统计来评估性能
  actualDuration?: number, // 本次更新过程, 本节点以及子树所消耗的总时间
  actualStartTime?: number, // 标记本fiber节点开始构建的时间
  selfBaseDuration?: number, // 用于最近一次生成本fiber节点所消耗的实现
  treeBaseDuration?: number, // 生成子树所消耗的时间的总和
|};
```

属性解释:

- `fiber.tag`: 表示 fiber 类型, 根据`ReactElement`组件的 type 进行生成, 在 react 内部共定义了[25 种 tag](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactWorkTags.js#L10-L35).
- `fiber.key`: 和`ReactElement`组件的 key 一致.
- `fiber.elementType`: 一般来讲和`ReactElement`组件的 type 一致
- `fiber.type`: 一般来讲和`fiber.elementType`一致. 一些特殊情形下, 比如在开发环境下为了兼容热更新(`HotReloading`), 会对`function, class, ForwardRef`类型的`ReactElement`做一定的处理, 这种情况会区别于`fiber.elementType`, 具体赋值关系可以查看[源文件](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiber.old.js#L571-L574).
- `fiber.stateNode`: 指向与`fiber`节点对应的 dom 节点(`HostRootFiber`根节点除外, 根节点`fiber.stateNode`指向的是`FiberRoot`).
- `fiber.return`: 指向父节点.
- `fiber.child`: 指向第一个子节点.
- `fiber.sibling`: 指向下一个兄弟节点.
- `fiber.index`: fiber 在兄弟节点中的索引, 如果是单节点默认为 0.
- `fiber.ref`: 指向在`ReactElement`组件上设置的 ref(`string`类型的`ref`除外, 这种类型的`ref`已经不推荐使用, `reconciler`阶段会`将string`类型的`ref`转换成一个`function`类型).
- `fiber.pendingProps`: 输入属性, 从父节点传入的 props,也就是即将使用的 props
- `fiber.memoizedProps`: 输出属性, 最终渲染所使用的 props.
- `fiber.updateQueue`: 存储`state`更新的队列, 当前节点的`state`改动之后, 都会创建一个`update`对象添加到这个队列中.
- `fiber.memoizedState`: 输出状态, 最终渲染所使用的 state.
- `fiber.dependencies`: 该 fiber 节点所依赖的(contexts, events)等, 在`context`机制章节详细说明.
- `fiber.mode`: 二进制位 Bitfield,继承至父节点,影响本 fiber 节点及其子树中所有节点. 与 react 应用的运行模式有关(有 ConcurrentMode, BlockingMode, NoMode 等选项).
- `fiber.flags`: 标志位, 副作用标记(在 16.x 版本中叫做`effectTag`, [pr](https://github.com/facebook/react/pull/19755)), 在[`ReactFiberFlags.js`](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberFlags.js#L10-L41)中定义了所有的标志位. `reconciler`阶段会将所有拥有`flags`标记的节点添加到副作用链表中, 等待 commit 阶段的处理.
- `fiber.subtreeFlags`: 替代 16.x 版本中的 firstEffect, nextEffect. 默认未开启, 当设置了[enableNewReconciler=true](https://github.com/facebook/react/blob/v17.0.1/packages/shared/ReactFeatureFlags.js#L93) 才会启用, 本系列只跟踪稳定版的代码, 未来版本不会深入解读, [使用示例见源码](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactFiberCompleteWork.new.js#L690-L714).
- `fiber.deletions`: 存储将要被删除的子节点. 默认未开启, 当设置了[enableNewReconciler=true](https://github.com/facebook/react/blob/v17.0.1/packages/shared/ReactFeatureFlags.js#L93) 才会启用, 本系列只跟踪稳定版的代码, 未来版本不会深入解读, [使用示例见源码](https://github.com/facebook/react/blob/v17.0.1/packages/react-reconciler/src/ReactChildFiber.new.js#L275-L287).
- `fiber.nextEffect`: 单项链表, 指向下一个有副作用的 fiber 节点.
- `fiber.firstEffect`: 指向副作用链表中的第一个 fiber 节点.
- `fiber.lastEffect`: 指向副作用链表中的最后一个 fiber 节点.
- `fiber.lanes`: 本 fiber 节点所属的优先级, 创建 fiber 的时候设置.
- `fiber.childLanes`: 子节点所属的优先级.
- `fiber.alternate`: 指向内存中的另一个 fiber, 每个被更新过 fiber 节点在内存中都是成对出现(current 和 workInProgress)

通过以上 25 个属性的解释, 对`fiber`对象有一个初步的认识.

最后绘制一颗 fiber 树与上文中的`ReactElement`树对照起来:

![](../../snapshots/data-structure/fiber-tree.png)

注意:

- 这里的`fiber`树只是为了和上文中的`ReactElement`树对照, 所以只用观察红色虚线框内的节点. 根节点`HostRootFiber`在[react 应用的启动模式章节中](./bootstrap.md)详细解读.
- 其中`<App/>`,`<Content/>`为`ClassComponent`类型的`fiber`节点, 其余节点都是普通`HostComponent`类型节点.
- `<Content/>`的子节点在`ReactElement`树中是`React.Fragment`, 但是在`fiber`树中`React.Fragment`并没有与之对应的`fiber`节点(`reconciler`阶段对此类型节点做了单独处理, 所以`ReactElement`节点和`fiber`节点不是一对一匹配).

#### Update 对象

#### Hook 对象

### scheduler 包

#### Task 对象

## 数据结构

下面对于 react 用到的高频数据结构做一下汇总.

### bitmask

- 位掩码, 用二进制位来表示的常量. 多用于表示枚举类型的数据, 优势是能够方便的对枚举常量进行组合与拆分.
- worktag
- lanes

### 栈

- 栈, 先进后出. 多用于记录 context 状态, 优势是能够精确的控制每一帧.
- context

### 链表

- fiber
- updateQueue
- hook

### 树

- fiber
