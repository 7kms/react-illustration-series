# react 基础包结构
> 在web开发中, 集中关注`react-reconciler`

## react
> react核心包, 提供react对象的创建, 修改等api
## react-dom
> react渲染器之一, 针对web平台, 可以在浏览器和nodejs环境中使用
## react-reconciler
> 管理react的输入和输出. 接受输入(初始化, 更改), 将输入信号转换成Fiber数据结构, 将最终的结果输出给渲染器(react-dom, react-native等)进行渲染
## scheduler
> 负责task队列, updatequeue队列的调度. update对象的expirationTime的计算
## shared
> 针对react运行抽象出来的公共函数