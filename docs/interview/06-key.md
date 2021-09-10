# key 有什么作用, 可以省略吗?

在 react 组件开发的过程中, `key`是一个常用的属性值, 多用于列表开发. 本文从源码的角度, 分析`key`在`react`内部是如何使用的, `key`是否可以省略.

## ReactElement 对象

我们在编程时直接书写的`jsx`代码, 实际上是会被编译成 ReactElement 对象, 所以`key`是`ReactElement对象`的一个属性.

### 构造函数

在把`jsx`转换成`ReactElement对象`的语法时, 有一个兼容问题. 会根据编译器的不同策略, 编译成 2 种方案.

1. 最新的转译策略: 会将`jsx`语法的代码, 转译成`jsx()`函数包裹

   `jsx`函数: 只保留与`key`相关的代码(其余源码本节不讨论)

   ```js
   /**
    * https://github.com/reactjs/rfcs/pull/107
    * @param {*} type
    * @param {object} props
    * @param {string} key
    */
   export function jsx(type, config, maybeKey) {
     let propName;

     // 1. key的默认值是null
     let key = null;

     // Currently, key can be spread in as a prop. This causes a potential
     // issue if key is also explicitly declared (ie. <div {...props} key="Hi" />
     // or <div key="Hi" {...props} /> ). We want to deprecate key spread,
     // but as an intermediary step, we will use jsxDEV for everything except
     // <div {...props} key="Hi" />, because we aren't currently able to tell if
     // key is explicitly declared to be undefined or not.
     if (maybeKey !== undefined) {
       key = '' + maybeKey;
     }

     if (hasValidKey(config)) {
       // 2. 将key转换成字符串
       key = '' + config.key;
     }
     // 3. 将key传入构造函数
     return ReactElement(
       type,
       key,
       ref,
       undefined,
       undefined,
       ReactCurrentOwner.current,
       props,
     );
   }
   ```

2. 传统的转译策略: 会将`jsx`语法的代码, 转译成[React.createElement()函数包裹](https://github.com/facebook/react/blob/v17.0.2/packages/react/src/ReactElement.js#L126-L146)

   `React.createElement()函数`: 只保留与`key`相关的代码(其余源码本节不讨论)

   ```js
   /**
    * Create and return a new ReactElement of the given type.
    * See https://reactjs.org/docs/react-api.html#createelement
    */
   export function createElement(type, config, children) {
     let propName;

     // Reserved names are extracted
     const props = {};

     let key = null;
     let ref = null;
     let self = null;
     let source = null;

     if (config != null) {
       if (hasValidKey(config)) {
         key = '' + config.key; // key转换成字符串
       }
     }

     return ReactElement(
       type,
       key,
       ref,
       self,
       source,
       ReactCurrentOwner.current,
       props,
     );
   }
   ```

可以看到无论采取哪种编译方式, 核心逻辑都是一致的:

1. `key`的默认值是`null`
2. 如果外界有显示指定的`key`, 则将`key`转换成字符串类型.
3. 调用`ReactElement`这个构造函数, 并且将`key`传入.

```js
// ReactElement的构造函数: 本节就先只关注其中的key属性
const ReactElement = function(type, key, ref, self, source, owner, props) {
  const element = {
    $$typeof: REACT_ELEMENT_TYPE,
    type: type,
    key: key,
    ref: ref,
    props: props,
    _owner: owner,
  };
  return element;
};
```

源码看到这里, 虽然还只是个皮毛, 但是起码知道了`key`的默认值是`null`. 所以任何一个`reactElement`对象, 内部都是有`key`值的, 只是一般情况下(非 list 结构)没人显示去传入一个 key.

## Fiber 对象

`react`的核心运行逻辑, 是一个从输入到输出的过程(回顾[reconciler 运作流程](../main/reconciler-workflow.md)). 编程直接操作的`jsx`是`reactElement对象`,我们(程序员)的数据模型是`jsx`, 而`react内核`的数据模型是`fiber树形结构`. 所以要深入认识`key`还需要从`fiber`的视角继续来看.

`fiber`对象是在`fiber树构造循环`过程中构造的, 其构造函数如下:

```js
function FiberNode(
  tag: WorkTag,
  pendingProps: mixed,
  key: null | string,
  mode: TypeOfMode,
) {
  this.tag = tag;
  this.key = key; // 重点: key也是`fiber`对象的一个属性

  // ...
  this.elementType = null;
  this.type = null;
  this.stateNode = null;
  // ... 省略无关代码
}
```

可以看到, `key`也是`fiber`对象的一个属性. 这里和`reactElement`的情况有所不同:

1. `reactElement`中的`key`是由`jsx`编译而来, `key`是由程序员直接控制的(及时是动态生成, 那也是直接控制)
2. `fiber`对象是由`react`内核在运行时创建的, 所以`fiber.key`也是`react`内核进行设置的, 程序员没有直接控制.

逻辑来到这里, 有 2 个疑问:

1. `fiber.key`是由`react`内核设置, 那他的值是否和`reactElement.key`相同?
2. 如果`reactElement.key = null`, 那么`fiber.key`就一定是`null`吗?

要继续跟进这些问题, 还得从`fiber`的创建说起. 上文提到了, `fiber`对象的创建发生在`fiber树构造循环`阶段中, 具体来讲, 是在`reconcilerChildren`调和函数中进行创建.

## reconcilerChildren 调和函数

`reconcilerChildren`是`react`中的一个`明星`函数, 最热点的问题就是`diff算法原理`, 事实上, `key`的作用完全就是为了`diff算法`服务的.

> 注意: 本节只分析 key 相关的逻辑, 对于调和函数的算法原理, 请回顾算法章节[React 算法之调和算法](../algorithm/diff.md)

调和函数源码(本节示例, 只摘取了部分代码):

```js
function ChildReconciler(shouldTrackSideEffects) {
  function reconcileChildFibers(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChild: any,
    lanes: Lanes,
  ): Fiber | null {
    // Handle object types
    const isObject = typeof newChild === 'object' && newChild !== null;

    if (isObject) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          // newChild是单节点
          return placeSingleChild(
            reconcileSingleElement(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes,
            ),
          );
      }
    }
    //  newChild是多节点
    if (isArray(newChild)) {
      return reconcileChildrenArray(
        returnFiber,
        currentFirstChild,
        newChild,
        lanes,
      );
    }
    // ...
  }

  return reconcileChildFibers;
}
```

### 单节点

这里先看单节点的情况`reconcileSingleElement`(只保留与`key`有关的逻辑):

```js
function reconcileSingleElement(
  returnFiber: Fiber,
  currentFirstChild: Fiber | null,
  element: ReactElement,
  lanes: Lanes,
): Fiber {
  const key = element.key;
  let child = currentFirstChild;
  while (child !== null) {
    //重点1: key是单节点是否复用的第一判断条件
    if (child.key === key) {
      switch (child.tag) {
        default: {
          if (child.elementType === element.type) {
            // 第二判断条件
            deleteRemainingChildren(returnFiber, child.sibling);
            // 节点复用: 调用useFiber
            const existing = useFiber(child, element.props);
            existing.ref = coerceRef(returnFiber, child, element);
            existing.return = returnFiber;
            return existing;
          }
          break;
        }
      }
      // Didn't match.
      deleteRemainingChildren(returnFiber, child);
      break;
    }
    child = child.sibling;
  }
  // 重点2: fiber节点创建, `key`是随着`element`对象被传入`fiber`的构造函数
  const created = createFiberFromElement(element, returnFiber.mode, lanes);
  created.ref = coerceRef(returnFiber, currentFirstChild, element);
  created.return = returnFiber;
  return created;
}
```

可以看到, 对于单节点来讲, 有 2 个重点:

1. `key`是单节点是否复用的第一判断条件(第二判断条件是`type`是否改变).
   - 如果`key`不同, 其他条件是完全不看的
2. 在新建节点时, `key`随着`element`对象被传入`fiber`的构造函数.

所以到这里才是`key`的最核心作用, 是调和函数中, 针对单节点是否可以复用的`第一判断条件`.

另外我们可以得到, `fiber.key`是`reactElement.key`的拷贝, 他们是完全相等的(包括`null`默认值).

### 多节点

继续查看多节点相关的逻辑:

```js
function reconcileChildrenArray(
  returnFiber: Fiber,
  currentFirstChild: Fiber | null,
  newChildren: Array<*>,
  lanes: Lanes,
): Fiber | null {
  if (__DEV__) {
    // First, validate keys.
    let knownKeys = null;
    for (let i = 0; i < newChildren.length; i++) {
      const child = newChildren[i];
      // 1. 在dev环境下, 执行warnOnInvalidKey.
      //  - 如果没有设置key, 会警告提示, 希望能显示设置key
      //  - 如果key重复, 会错误提示.
      knownKeys = warnOnInvalidKey(child, knownKeys, returnFiber);
    }
  }

  let resultingFirstChild: Fiber | null = null;
  let previousNewFiber: Fiber | null = null;

  let oldFiber = currentFirstChild;
  let lastPlacedIndex = 0;
  let newIdx = 0;
  let nextOldFiber = null;
  // 第一次循环: 只会在更新阶段发生
  for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
    if (oldFiber.index > newIdx) {
      nextOldFiber = oldFiber;
      oldFiber = null;
    } else {
      nextOldFiber = oldFiber.sibling;
    }
    // 1. 调用updateSlot, 处理公共序列中的fiber
    const newFiber = updateSlot(
      returnFiber,
      oldFiber,
      newChildren[newIdx],
      lanes,
    );
  }

  // 第二次循环
  if (oldFiber === null) {
    for (; newIdx < newChildren.length; newIdx++) {
      // 2. 调用createChild直接创建新fiber
      const newFiber = createChild(returnFiber, newChildren[newIdx], lanes);
    }
    return resultingFirstChild;
  }

  for (; newIdx < newChildren.length; newIdx++) {
    // 3. 调用updateFromMap处理非公共序列中的fiber
    const newFiber = updateFromMap(
      existingChildren,
      returnFiber,
      newIdx,
      newChildren[newIdx],
      lanes,
    );
  }

  return resultingFirstChild;
}
```

在`reconcileChildrenArray`中, 有 3 处调用与`fiber`有关(当然顺便就和`key`有关了), 它们分布是:

1.  `updateSlot`

    ```js
    function updateSlot(
      returnFiber: Fiber,
      oldFiber: Fiber | null,
      newChild: any,
      lanes: Lanes,
    ): Fiber | null {
      const key = oldFiber !== null ? oldFiber.key : null;

      if (typeof newChild === 'object' && newChild !== null) {
        switch (newChild.$$typeof) {
          case REACT_ELEMENT_TYPE: {
            //重点: key用于是否复用的第一判断条件
            if (newChild.key === key) {
              return updateElement(returnFiber, oldFiber, newChild, lanes);
            } else {
              return null;
            }
          }
        }
      }

      return null;
    }
    ```

2.  `createChild`

    ```js
    function createChild(
      returnFiber: Fiber,
      newChild: any,
      lanes: Lanes,
    ): Fiber | null {
      if (typeof newChild === 'object' && newChild !== null) {
        switch (newChild.$$typeof) {
          case REACT_ELEMENT_TYPE: {
            // 重点: 调用构造函数进行创建
            const created = createFiberFromElement(
              newChild,
              returnFiber.mode,
              lanes,
            );
            return created;
          }
        }
      }

      return null;
    }
    ```

3.  `updateFromMap`
    ```js
    function updateFromMap(
    existingChildren: Map<string | number, Fiber>,
    returnFiber: Fiber,
    newIdx: number,
    newChild: any,
    lanes: Lanes,
    ): Fiber | null {

              if (typeof newChild === 'object' && newChild !== null) {
                switch (newChild.$$typeof) {
                  case REACT_ELEMENT_TYPE: {
                    //重点: key用于是否复用的第一判断条件
                    const matchedFiber =
                      existingChildren.get(
                        newChild.key === null ? newIdx : newChild.key,
                      ) || null;
                    return updateElement(returnFiber, matchedFiber, newChild, lanes);
                  }
              }
              return null;
            }
        ```

    其中, 与 key 相关的重点都在注释中说明了, 需要注意的是`updateFromMap`这是第二次循环中对于非公共序列的解析, 如果`reactElement`没有显示设置 key, 也就是其中`newChild.key === null`, 这时候, 会用`index`进行查找.

所以在多节点情况下, `key`任然是用于是否复用的第一判断条件, 如果`key`不同是肯定不会复用的.

## 总结

本节从源码的角度, 分别从`reactElement对象`和`fiber对象`2 个视角进行展开, 分析`key`在 react 内核中的使用情况. 最终在调和函数`reconcilerChildren`中, `key`得到了最终的应用, 作为`节点复用`的第一判断条件.
