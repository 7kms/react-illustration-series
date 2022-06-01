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
2. 如果外界有显式指定的`key`, 则将`key`转换成字符串类型.
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

源码看到这里, 虽然还只是个皮毛, 但是起码知道了`key`的默认值是`null`. 所以任何一个`reactElement`对象, 内部都是有`key`值的, 只是一般情况下(对于单节点)很少显式去传入一个 key.

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

1. `reactElement`中的`key`是由`jsx`编译而来, `key`是由程序员直接控制的(即使是动态生成, 那也是直接控制)
2. `fiber`对象是由`react`内核在运行时创建的, 所以`fiber.key`也是`react`内核进行设置的, 程序员没有直接控制.

注意: `fiber.key`是`reactElement.key`的拷贝, 他们是完全相等的(包括`null`默认值).

接下来分析`fiber`创建, 剖析`key`在这个过程中的具体使用情况.

`fiber`对象的创建发生在`fiber树构造循环`阶段中, 具体来讲, 是在`reconcileChildren`调和函数中进行创建.

## reconcileChildren 调和函数

`reconcileChildren`是`react`中的一个`明星`函数, 最热点的问题就是`diff算法原理`, 事实上, `key`的作用完全就是为了`diff算法`服务的.

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

对于单节点来讲, `key`是可以省略的, `react`内部会设置成默认值`null`. 在进行`diff`时, 由于`null===null`为`true`, 前后`render`的`key`是一致的, 可以进行复用比较. 

如果单节点显式设置了`key`, 且两次`render`时的`key`如果不一致, 则无法复用.

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
      //  - 如果没有设置key, 会警告提示, 希望能显式设置key
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
    if (newFiber === null) {
        // 如果无法复用, 则退出公共序列的遍历
        if (oldFiber === null) {
          oldFiber = nextOldFiber;
        }
        break;
     }
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

在`reconcileChildrenArray`中, 有 3 处调用与`fiber`有关(当然顺便就和`key`有关了), 它们分别是:

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
    }
    ```
针对多节点的`diff算法`可以分为3步骤(请回顾算法章节[React 算法之调和算法](../algorithm/diff.md)):
1. 第一次循环: 比较公共序列
   - 从左到右逐一遍历, 遇到一个无法复用的节点则退出循环.
2. 第二次循环: 比较非公共序列
   - 在第一次循环的基础上, 如果`oldFiber`队列遍历完了, 证明`newChildren`队列中剩余的对象全部都是新增. 
    - 此时继续遍历剩余的`newChildren`队列即可, 没有额外的`diff`比较.
   - 在第一次循环的基础上, 如果`oldFiber`队列没有遍历完, 需要将`oldFiber`队列中剩余的对象都添加到一个`map`集合中, 以`oldFiber.key`作为键.
    - 此时则在遍历剩余的`newChildren`队列时, 需要用`newChild.key`到`map`集合中进行查找, 如果匹配上了, 就将`oldFiber`从`map`中取出来, 同`newChild`进行`diff`比较.
3. 清理工作
   - 在第二次循环结束后, 如果`map`集合中还有剩余的`oldFiber`,则可以证明这些`oldFiber`都是被删除的节点, 需要打上删除标记.

通过回顾`diff算法`的原理, 可以得到`key`在多节点情况下的特性:
1. 新队列`newChildren`中的每一个对象(即`reactElement`对象)都需要同旧队列`oldFiber`中有相同`key`值的对象(即`oldFiber`对象)进行是否可复用的比较. `key`就是新旧对象能够对应起来的唯一标识.
2. 如果省略`key`或者直接使用列表`index`作为`key`, 表现是一样的(`key=null`时, 会采用`index`代替`key`进行比较). 在新旧对象比较时, 只能按照`index`顺序进行比较, 复用的成功率大大降低, 大列表会出现性能问题.
   - 例如一个排序的场景: `oldFiber`队列有100个, `newChildren`队列有100个(但是打乱了顺序). 由于没有设置`key`, 就会导致`newChildren`中的第n个必然要和`oldFiber`队列中的第n个进行比较, 这时它们的`key`完全一致(都是`null`), 由于顺序变了导致`props`不同, 所以新的`fiber`完全要走更新逻辑(理论上比新创建一个的性能还要耗).
   - 同样是排序场景可以出现的bug: 上面的场景只是性能差(又不是不能用), `key`使用不当还会造成`bug`
    - 还是上述排序场景, 只是列表中的每一个`item`内部又是一个组件, 且其中某一个`item`使用了局部状态(比如`class组件`里面的`state`). 当第二次`render`时, `fiber`对象不会`delete`只会`update`导致新组件的`state`还沿用了上一次相同位置的旧组件的`state`, 造成了状态混乱.

## 总结

在`react`中`key`是服务于`diff算法`, 它的默认值是`null`, 在`diff算法`过程中, 新旧节点是否可以复用, 首先就会判定`key`是否相同, 其后才会进行其他条件的判定. 在源码中, 针对多节点(即列表组件)如果直接将`key`设置成`index`和不设置任何值的处理方案是一样的, 如果使用不当, 轻则造成性能损耗, 重则引起状态混乱造成bug. 

