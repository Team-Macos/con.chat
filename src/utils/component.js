import {
  COMPONENT_BLOCK_STYLE,
  ROOT_COMPONENT_BLOCK_STYLE,
} from '../constant/chat.js';

const findReactRootContainer = () => {
  const bodyElements = document.body.children;

  for (let i = 0; i < bodyElements.length; i++) {
    const element = bodyElements[i];
    const keys = Object.keys(element);

    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];

      if (key.includes('__reactContainer$')) {
        return element[key].stateNode.current;
      }
    }
  }

  return null;
};

const traverseFragment = (component) => {
  const fragmentComponents = ['<React.Fragment />'];

  const traverse = (target) => {
    if (target === null) return;

    if (typeof target.type === 'function') {
      fragmentComponents.push(target.type.name);
    } else {
      fragmentComponents.push(target.stateNode);
    }

    if (target.sibling) traverse(target.sibling);
  };

  traverse(component);

  return fragmentComponents;
};

const cleanState = (state, seen = new WeakSet()) => {
  if (!state || typeof state !== 'object' || seen.has(state)) return state;

  seen.add(state);

  const cleanedState = Array.isArray(state) ? [] : {};

  const isValidProp = (key, value) => {
    const invalidProps = [
      'baseState',
      'baseQueue',
      'deps',
      'destroy',
      'create',
      '_owner',
      '_store',
      '_source',
    ];
    return (
      !key.startsWith('_') &&
      !key.startsWith('$$') &&
      !invalidProps.includes(key) &&
      typeof value !== 'function'
    );
  };

  Object.keys(state).forEach((key) => {
    if (isValidProp(key, state[key])) {
      cleanedState[key] = cleanState(state[key], seen);
    }
  });

  if (state.next) {
    cleanedState.next = cleanState(state.next, seen);
  }

  return cleanedState;
};

const cleanProps = (props, seen = new WeakSet()) => {
  if (!props || typeof props !== 'object' || seen.has(props)) return props;

  seen.add(props);

  const cleanedProps = {};

  const isValidProp = (key, value) => {
    const invalidProps = ['key', 'type', 'ref', '_owner', '_store', '_source'];
    return (
      !key.startsWith('_') &&
      !key.startsWith('$$') &&
      !invalidProps.includes(key) &&
      typeof value !== 'function'
    );
  };

  Object.keys(props).forEach((key) => {
    if (isValidProp(key, props[key])) {
      cleanedProps[key] = cleanProps(props[key], seen);
    }
  });

  return cleanedProps;
};

const extractFiberData = (node, seen = new WeakSet()) => {
  if (!node || seen.has(node)) return null;

  seen.add(node);

  const { elementType, child, memoizedState, memoizedProps } = node;
  const componentName = elementType
    ? elementType.name || 'Anonymous'
    : 'HostComponent';

  if (componentName === 'HostComponent') {
    return extractFiberData(child, seen);
  }

  const fiberData = {
    component: componentName,
    state: cleanState(memoizedState),
    props: cleanProps(memoizedProps),
    children: [],
  };

  let childNode = child;
  while (childNode) {
    const childData = extractFiberData(childNode, seen);

    if (childData) {
      fiberData.children.push(childData);
    }

    childNode = childNode.sibling;
  }

  return fiberData;
};

const logFiberTree = () => {
  const fiberRoot = findReactRootContainer();

  if (!fiberRoot) return null;

  const tree = extractFiberData(fiberRoot);

  if (tree.component === 'Anonymous' && tree.children.length > 0) {
    return tree.children[0];
  }

  return tree;
};

const compareObjects = (obj1, obj2, path = '') => {
  const differences = [];

  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    if (obj1 !== obj2) {
      differences.push(`${path}: ${obj1} !== ${obj2}`);
    }

    return differences;
  }

  if (obj1 === null || obj2 === null) {
    if (obj1 !== obj2) {
      differences.push(`${path}: ${obj1} !== ${obj2}`);
    }

    return differences;
  }

  const keys1 = Object.keys(obj1).sort();
  const keys2 = Object.keys(obj2).sort();
  const allKeys = new Set([...keys1, ...keys2]);

  allKeys.forEach((key) => {
    if (!keys1.includes(key)) {
      differences.push(`${path}.${key}: key missing in obj1`);
    } else if (!keys2.includes(key)) {
      differences.push(`${path}.${key}: key missing in obj2`);
    } else {
      differences.push(
        ...compareObjects(obj1[key], obj2[key], `${path}.${key}`),
      );
    }
  });
  return differences;
};

const compareNodes = (node1, node2, path = '', differences = []) => {
  if (!node1 || !node2) return;

  if (node1.component !== node2.component) {
    differences.push(`${path}: ${node1.component} !== ${node2.component}`);

    return;
  }

  const cleanNode1State = cleanState(node1.state);
  const cleanNode2State = cleanState(node2.state);
  const cleanNode1Props = cleanProps(node1.props);
  const cleanNode2Props = cleanProps(node2.props);

  const stateDifferences = compareObjects(
    cleanNode1State,
    cleanNode2State,
    `${path}.state`,
  );
  const propsDifferences = compareObjects(
    cleanNode1Props,
    cleanNode2Props,
    `${path}.props`,
  );

  if (stateDifferences.length > 0 || propsDifferences.length > 0) {
    differences.push({
      path: `${path}/${node1.component}`,
      current: {
        state: cleanNode1State,
        props: cleanNode1Props,
      },
      shared: {
        state: cleanNode2State,
        props: cleanNode2Props,
      },
      stateDifferences,
      propsDifferences,
    });
  }

  for (
    let i = 0;
    i < Math.max(node1.children.length, node2.children.length);
    i++
  ) {
    compareNodes(
      node1.children[i],
      node2.children[i],
      `${path}/${node1.component}.children[${i}]`,
      differences,
    );
  }
};

const compareTrees = (currentTree, sharedTree) => {
  const differences = [];
  compareNodes(currentTree, sharedTree, '', differences);
  return differences;
};

const getCircularReplacer = () => {
  const seen = new WeakSet();

  return (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return undefined;
      }

      seen.add(value);
    }

    return value;
  };
};

const colorize = (text, styles) => {
  return [`%c${text}`, styles];
};

const findReactRootNode = (element) => {
  if (!element) return null;

  if (
    Object.keys(element).some(
      (key) =>
        key.startsWith('__reactFiber$') ||
        key.startsWith('__reactInternalInstance$'),
    )
  ) {
    return element;
  }

  const childrenArray = Array.from(element.children);
  let reactNode = null;

  childrenArray.some((children) => {
    reactNode = findReactRootNode(children);

    return reactNode;
  });

  return reactNode;
};

const findReactFiber = (element) => {
  const reactKey = Object.keys(element).find(
    (key) =>
      key.startsWith('__reactFiber$') ||
      key.startsWith('__reactInternalInstance$'),
  );

  return reactKey ? element[reactKey] : null;
};

const findHostComponent = (fiber) => {
  let node = fiber;

  while (node) {
    if (node.stateNode instanceof HTMLElement) {
      return node.stateNode;
    }

    node = node.child;
  }
};

const printComponentTree = (
  fiber,
  differences,
  currentUsername,
  sharedUsername,
  depth = 0,
  isLast = true,
  prefix = '',
) => {
  if (!fiber) return '';

  const connector = isLast ? '└─' : '├─';
  const line = depth > 0 ? `${prefix}${connector}` : '';

  const componentName = fiber.component;
  const componentType = '▸';
  const styles = `
    background-color: #F2CF65;
    color: #000;
    padding: 3px 5px;
    border-radius: 4px;
  `;
  const [styledComponentName, styleString] = colorize(componentName, styles);

  const currentDiff = differences.find((diff) =>
    diff.path.endsWith(`/${componentName}`),
  );

  if (componentName !== 'Anonymous') {
    if (currentDiff) {
      const stateDiff =
        currentDiff.stateDifferences.length > 0
          ? currentDiff.stateDifferences.join(', ').split(', ')
          : ['없음'];
      const propsDiff =
        currentDiff.propsDifferences.length > 0
          ? currentDiff.propsDifferences.join(', ').split(', ')
          : ['없음'];

      console.log(
        `${line}${componentType} ${styledComponentName}`,
        styleString,
        {
          [`${sharedUsername}님의 정보`]: {
            state: currentDiff.shared.state,
            props: currentDiff.shared.props,
          },
          [`${currentUsername}님의 정보`]: {
            state: currentDiff.current.state,
            props: currentDiff.current.props,
          },
        },
        {
          'State 차이점': stateDiff,
          'Props의 차이점': propsDiff,
        },
      );
    } else {
      console.log(
        `${line}${componentType} ${styledComponentName}`,
        styleString,
      );
    }

    fiber.children.forEach((child, index) => {
      let newPrefix = prefix;
      if (depth > 0) {
        newPrefix += isLast ? '  ' : '| ';
      }
      printComponentTree(
        child,
        differences,
        currentUsername,
        sharedUsername,
        depth + 1,
        index === fiber.children.length - 1,
        newPrefix,
      );
    });
  } else {
    fiber.children.forEach((child, index) => {
      let newPrefix = prefix;
      if (depth > 0) {
        newPrefix += isLast ? '  ' : '| ';
      }
      printComponentTree(
        child,
        differences,
        currentUsername,
        sharedUsername,
        depth,
        index === fiber.children.length - 1,
        newPrefix,
      );
    });
  }

  return null;
};

const traverseFiberTree = (
  fiber,
  depth = 0,
  isLast = true,
  prefix = '',
  isRoot = false,
) => {
  if (!fiber) return;

  const connector = isLast ? '└─' : '├─';
  const line = depth > 0 ? `${prefix}${connector}` : '';

  if (isRoot) {
    const domElement = findHostComponent(fiber);
    const componentType = '▸';

    const [styledComponentName, styleString] = colorize(
      'App',
      ROOT_COMPONENT_BLOCK_STYLE,
    );

    console.log(
      `${line}${componentType} ${styledComponentName}`,
      styleString,
      domElement,
    );
  } else if (fiber.type && fiber.type.name) {
    const componentName = fiber.type.name;
    const componentType = '▸';

    const [styledComponentName, styleString] = colorize(
      componentName,
      COMPONENT_BLOCK_STYLE,
    );

    if (componentName === 'Routes' || componentName === 'RenderedRoute') {
      console.log(
        `${line}${componentType} ${styledComponentName}`,
        styleString,
      );
    } else {
      const domElement = findHostComponent(fiber);

      if (domElement) {
        console.log(
          `${line}${componentType} ${styledComponentName}`,
          styleString,
          domElement,
        );
      } else {
        console.log(
          `${line}${componentType} ${styledComponentName}`,
          styleString,
        );
      }
    }
  }

  if (fiber.child) {
    let { child } = fiber;
    let siblingCount = 0;

    while (child) {
      siblingCount++;
      child = child.sibling;
    }

    child = fiber.child;
    let count = 0;

    while (child) {
      count++;

      const isLastChild = count === siblingCount;
      const newPrefix = `${prefix}${isLast ? '  ' : '| '}`;

      traverseFiberTree(child, depth + 1, isLastChild, newPrefix);
      child = child.sibling;
    }
  }
};

const findAppFiber = (fiber) => {
  let node = fiber;

  while (node) {
    if (
      node.type &&
      (node.type.name === 'App' || node.type.displayName === 'App')
    ) {
      return node;
    }

    node = node.child;
  }

  return fiber;
};

const drawComponentTree = () => {
  const rootElement = findReactRootNode(document.body);

  if (!rootElement) {
    console.log('🚫 리액트 루트 요소를 찾을 수 없습니다.');
  } else {
    const fiberRoot = findReactFiber(rootElement);

    if (fiberRoot) {
      const appFiber = findAppFiber(fiberRoot);
      traverseFiberTree(appFiber, 0, true, '', true);
    } else {
      console.log('🚫 파이버 루트를 찾을 수 없습니다.');
    }
  }
};

export {
  findReactRootContainer,
  traverseFragment,
  drawComponentTree,
  logFiberTree,
  printComponentTree,
  compareTrees,
  getCircularReplacer,
};
