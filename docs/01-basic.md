# react 基础包结构

> 这里只列举与 web 开发相关的核心包

## react

> react 核心包, 提供操作`react`对象(`ReactElement`)的全局 api

## react-dom

> react 渲染器之一, 是 react 与 web 平台连接的桥梁, 可以在浏览器和 nodejs 环境中使用.

## react-reconciler

> react 工作空间核心包(综合协调`react-dom`,`react`,`scheduler`各包之间的调用与配合). 管理 react 的输入和输出. 接受输入(初始化, 更改), 将输入信息进行处理(涉及调度机制, fiber 树形结构, update 队列等), 处理完成之后再次调用渲染器(react-dom, react-native 等)进行输出

## scheduler

> 调度机制的核心实现

## shared

> 针对 react 运行抽象出来的公共函数
