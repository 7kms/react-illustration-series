---
title: 位运算
---

# React 算法之位运算

网络上介绍位运算的文章非常多(如[MDN 上的介绍](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators)就很仔细).

本文的目的:

1. 温故知新, 对位运算的基本使用做一下简单的总结.
2. 归纳在`javascript`中使用位运算的注意事项.
3. 列举在`react`源码中, 对于位运算的高频使用场景.

## 概念

位运算直接处理每一个比特位(bit), 是非常底层的运算, 优势是速度快, 劣势就是不直观且只支持整数运算.

## 特性

| 位运算            | 用法     | 描述                                                                        |
| ----------------- | -------- | --------------------------------------------------------------------------- |
| 按位与(`&`)       | `a & b`  | 对于每一个比特位,两个操作数都为 1 时, 结果为 1, 否则为 0                    |
| 按位或(`\|`)      | `a \| b` | 对于每一个比特位,两个操作数都为 0 时, 结果为 0, 否则为 1                    |
| 按位异或(`^`)     | `a ^ b`  | 对于每一个比特位,两个操作数相同时, 结果为 1, 否则为 0                       |
| 按位非(`~`)       | `~ a`    | 反转操作数的比特位, 即 0 变成 1, 1 变成 0                                   |
| 左移(`<<`)        | `a << b` | 将 a 的二进制形式向左移 b (< 32) 比特位, 右边用 0 填充                      |
| 有符号右移(`>>`)  | `a >> b` | 将 a 的二进制形式向右移 b (< 32) 比特位, 丢弃被移除的位, 左侧以最高位来填充 |
| 无符号右移(`>>>`) | `a >> b` | 将 a 的二进制形式向右移 b (< 32) 比特位, 丢弃被移除的位, 并用 0 在左侧填充  |

在[`ES5`规范中](https://www.ecma-international.org/ecma-262/5.1/#sec-11.10), 对二进制位运算的说明如下:

```
The production A : A @ B, where @ is one of the bitwise operators in the productions above, is evaluated as follows:
1. Let lref be the result of evaluating A.
2. Let lval be GetValue(lref).
3. Let rref be the result of evaluating B.
4. Let rval be GetValue(rref).
5. Let lnum be ToInt32(lval).
6. Let rnum be ToInt32(rval).
7. Return the result of applying the bitwise operator @ to lnum and rnum. The result is a signed 32 bit integer.
```

意思是会将位运算中的左右操作数都转换为`有符号32位整型`, 且返回结果也是`有符号32位整型`

- 所以当操作数是浮点型时首先会被转换成整型, 再进行位运算
- 当操作数过大, 超过了`Int32`范围, 超过的部分会被截取

通过以上知识的回顾, 要点如下:

1. 位运算只能在整型变量之间进行运算
2. js 中的`Number`类型在底层都是以浮点数(参考 IEEE754 标准)进行存储.
3. js 中所有的按位操作符的操作数都会被[转成补码（two's complement）](https://www.ecma-international.org/ecma-262/5.1/#sec-9.5)形式的`有符号32位整数`.

所以在 js 中使用位运算时, 有 2 种情况会造成结果异常:

1.  操作数为浮点型(虽然底层都是浮点型, 此处理解为显示性的浮点型)
    - 转换流程: 浮点数 -> 整数(丢弃小数位) -> 位运算
2.  操作数的大小超过`Int32`范围(`-2^31 ~ 2^31-1`). 超过范围的二进制位会被截断, 取`低位32bit`.

    ```
          Before: 11100110111110100000000000000110000000000001
          After:              10100000000000000110000000000001
    ```

另外由于 js 语言的[隐式转换](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Equality_comparisons_and_sameness), 对非`Number`类型使用位运算操作符时会隐式会发生隐式转换, 相当于先使用`Number(xxx)`将其转换为`number`类型, 再进行位运算:

```js
'str' >>> 0; //  ===> Number('str') >>> 0  ===> NaN >>> 0 = 0
```

## 基本使用

为了方便比较, 以下演示代码中的注释, 都写成了 8 位二进制数(上文已经说明, 事实上在 js 中, 位运算最终的结果都是 Int32).

枚举属性:

通过位移的方式, 定义一些枚举常量

```js
const A = 1 << 0; // 0b00000001
const B = 1 << 1; // 0b00000010
const C = 1 << 2; // 0b00000100
```

位掩码:

通过位移定义的一组枚举常量, 可以利用位掩码的特性, 快速操作这些枚举产量(增加, 删除, 比较).

1. 属性增加`|`
   1. `ABC = A | B | C`
2. 属性删除`& ~`
   1. `AB = ABC & ~C`
3. 属性比较
   1. AB 当中包含 B: `AB & B === B`
   2. AB 当中不包含 C: `AB & C === 0`
   3. A 和 B 相等: `A === B`

```js
const A = 1 << 0; // 0b00000001
const B = 1 << 1; // 0b00000010
const C = 1 << 2; // 0b00000100

// 增加属性
const ABC = A | B | C; // 0b00000111
// 删除属性
const AB = ABC & ~C; // 0b00000011

// 属性比较
// 1. AB当中包含B
console.log(AB & (B === B)); // true
// 2. AB当中不包含C
console.log(AB & (C === 0)); // true
// 3. A和B相等
console.log(A === B); // true
```

## React 当中的使用场景

在 react 核心包中, 位运算使用的场景非常多. 此处只列举出了使用频率较高的示例.

### 优先级管理 lanes

lanes 是`17.x`版本中开始引入的重要概念, 代替了`16.x`版本中的`expirationTime`, 作为`fiber`对象的一个属性(位于`react-reconciler`包), 主要控制 fiber 树在构造过程中的优先级(这里只介绍位运算的应用, 对于 lanes 的深入分析在[`优先级管理`](../main/priority.md)章节深入解读).

变量定义:

首先看源码[ReactFiberLane.js](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberLane.js#L74-L103)中的定义

```js
//类型定义
export opaque type Lanes = number;
export opaque type Lane = number;

// 变量定义
export const NoLanes: Lanes = /*                        */ 0b0000000000000000000000000000000;
export const NoLane: Lane = /*                          */ 0b0000000000000000000000000000000;

export const SyncLane: Lane = /*                        */ 0b0000000000000000000000000000001;
export const SyncBatchedLane: Lane = /*                 */ 0b0000000000000000000000000000010;

export const InputDiscreteHydrationLane: Lane = /*      */ 0b0000000000000000000000000000100;
const InputDiscreteLanes: Lanes = /*                    */ 0b0000000000000000000000000011000;

const InputContinuousHydrationLane: Lane = /*           */ 0b0000000000000000000000000100000;
const InputContinuousLanes: Lanes = /*                  */ 0b0000000000000000000000011000000;
// ...
// ...

const NonIdleLanes = /*                                 */ 0b0000111111111111111111111111111;

export const IdleHydrationLane: Lane = /*               */ 0b0001000000000000000000000000000;
const IdleLanes: Lanes = /*                             */ 0b0110000000000000000000000000000;

export const OffscreenLane: Lane = /*                   */ 0b1000000000000000000000000000000;
```

源码中`Lanes`和`Lane`都是`number`类型, 并且将所有变量都使用二进制位来表示.

注意: 源码中变量只列出了 31 位, 由于 js 中位运算都会转换成`Int32`(上文已经解释), 最多为 32 位, 且最高位是符号位. 所以除去符号位, 最多只有 31 位可以参与运算.

[方法定义](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberLane.js#L121-L194):

```js
function getHighestPriorityLanes(lanes: Lanes | Lane): Lanes {
  // 判断 lanes中是否包含 SyncLane
  if ((SyncLane & lanes) !== NoLanes) {
    return_highestLanePriority = SyncLanePriority;
    return SyncLane;
  }
  // 判断 lanes中是否包含 SyncBatchedLane
  if ((SyncBatchedLane & lanes) !== NoLanes) {
    return_highestLanePriority = SyncBatchedLanePriority;
    return SyncBatchedLane;
  }
  // ...
  // ... 省略其他代码
  return lanes;
}
```

在方法定义中, 也是通过位掩码的特性来判断二进制形式变量之间的关系. 除了常规的位掩码操作外, 特别说明其中 2 个技巧性强的函数:

1. `getHighestPriorityLane`: 分离出最高优先级

```js
function getHighestPriorityLane(lanes: Lanes) {
  return lanes & -lanes;
}
```

通过`lanes & -lanes`可以分离出所有比特位中最右边的 1, 具体来讲:

- 假设 `lanes(InputDiscreteLanes) = 0b0000000000000000000000000011000`
- 那么 `-lanes = 0b1111111111111111111111111101000`
- 所以 `lanes & -lanes = 0b0000000000000000000000000001000`
- 相比最初的 InputDiscreteLanes, 分离出来了`最右边的1`
- 通过 lanes 的定义, 数字越小的优先级越高, 所以此方法可以获取`最高优先级的lane`
-

2. `getLowestPriorityLane`: 分离出最低优先级

```js
function getLowestPriorityLane(lanes: Lanes): Lane {
  // This finds the most significant non-zero bit.
  const index = 31 - clz32(lanes);
  return index < 0 ? NoLanes : 1 << index;
}
```

`clz32(lanes)`返回一个数字在转换成 32 无符号整形数字的二进制形式后, 前导 0 的个数([MDN 上的解释](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32))

- 假设 `lanes(InputDiscreteLanes) = 0b0000000000000000000000000011000`
- 那么 `clz32(lanes) = 27`, 由于 InputDiscreteLanes 在源码中被书写成了 31 位, 虽然在字面上前导 0 是 26 个, 但是转成标准 32 位后是 27 个
- `index = 31 - clz32(lanes) = 4`
- 最后 `1 << index = 0b0000000000000000000000000010000`
- 相比最初的 InputDiscreteLanes, 分离出来了`最左边的1`
- 通过 lanes 的定义, 数字越小的优先级越高, 所以此方法可以获取最低优先级的 lane

### 执行上下文 ExecutionContext

`ExecutionContext`定义与`react-reconciler`包中, 代表`reconciler`在运行时的上下文状态(在`reconciler 执行上下文`章节中深入解读, 此处介绍位运算的应用).

[变量定义](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L247-L256):

```js
export const NoContext = /*             */ 0b0000000;
const BatchedContext = /*               */ 0b0000001;
const EventContext = /*                 */ 0b0000010;
const DiscreteEventContext = /*         */ 0b0000100;
const LegacyUnbatchedContext = /*       */ 0b0001000;
const RenderContext = /*                */ 0b0010000;
const CommitContext = /*                */ 0b0100000;
export const RetryAfterError = /*       */ 0b1000000;

// ...

// Describes where we are in the React execution stack
let executionContext: ExecutionContext = NoContext;
```

注意: 和`lanes`的定义不同, `ExecutionContext`类型的变量, 在定义的时候采取的是 8 位二进制表示(因为变量的数量少, 8 位就够了, 没有必要写成 31 位).

使用(由于使用的地方较多, 所以举一个[代表性强的例子](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L517-L619), `scheduleUpdateOnFiber` 函数是`react-reconciler`包对`react`包暴露出来的 api, 每一次更新都会调用, 所以比较特殊):

```js
// scheduleUpdateOnFiber函数中包含了好多关于executionContext的判断(都是使用位运算)
export function scheduleUpdateOnFiber(
  fiber: Fiber,
  lane: Lane,
  eventTime: number,
) {
  if (root === workInProgressRoot) {
    // 判断: executionContext 不包含 RenderContext
    if (
      deferRenderPhaseUpdateToNextBatch ||
      (executionContext & RenderContext) === NoContext
    ) {
      // ...
    }
  }
  if (lane === SyncLane) {
    if (
      // 判断: executionContext 包含 LegacyUnbatchedContext
      (executionContext & LegacyUnbatchedContext) !== NoContext &&
      // 判断: executionContext 不包含 RenderContext或CommitContext
      (executionContext & (RenderContext | CommitContext)) === NoContext
    ) {
      // ...
    }
  }
  // ...
}
```

## 总结

本节介绍了位运算的基本使用, 并列举了位运算在`react`源码中的高频应用. 在特定的情况下, 使用位运算不仅是提高运算速度, 且位掩码能简洁和清晰的表示出二进制变量之间的关系. 二进制变量虽然有优势, 但是缺点也很明显, 不够直观, 扩展性不好(在 js 当中的二进制变量, 除去符号位, 最多只能使用 31 位, 当变量的数量超过 31 位就需要组合, 此时就会变得复杂). 在阅读源码时, 我们需要了解二级制变量和位掩码的使用. 但在实际开发中, 需要视情况而定, 不能盲目使用.

## 参考资料

[ECMAScript® Language Specification(Standard ECMA-262 5.1 Edition) Binary Bitwise Operators](https://www.ecma-international.org/ecma-262/5.1/#sec-11.10)

[浮点数的二进制表示](https://www.ruanyifeng.com/blog/2010/06/ieee_floating-point_representation.html)

[IEEE 754](https://zh.wikipedia.org/wiki/IEEE_754)
