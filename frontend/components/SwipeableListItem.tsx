import * as React from 'react';
import { Animated, Dimensions, PanResponder, PanResponderGestureState, View } from 'react-native';
import { clx } from '../utils/clx';

const Screen = Dimensions.get('window');
const ScreenWidth = Screen.width;

export interface SwipeableListItemProps {
  /** Container class name.*/
  containerClassName?: string;

  /**
   * Left Content.
   * @type ReactNode or resetCallback => ReactNode
   */
  leftContent?: React.ReactNode | ((reset: () => void) => React.ReactNode);

  /**
   *  Right Content.
   * @type ReactNode or resetCallback => ReactNode
   */
  rightContent?: React.ReactNode | ((reset: () => void) => React.ReactNode);

  /** Left container class name.*/
  leftClassName?: string;

  /** Right container class name.*/
  rightClassName?: string;

  /** Width to swipe left. */
  leftWidth?: number;

  /** Width to swipe right. */
  rightWidth?: number;

  /** Handler for swipe in either direction */
  onSwipeBegin?: (direction: 'left' | 'right') => unknown;

  /** Handler for swipe end. */
  onSwipeEnd?: () => unknown;

  /** Decide whether to show animation.
   * @default Object with duration 350ms and type timing
   * @type Animated.TimingAnimationConfig
   */
  animation?: {
    type?: 'timing' | 'spring';
    duration?: number;
  };

  /** Accessibility label for the swipeable item */
  accessibilityLabel?: string;

  /** Accessibility hint describing the swipe actions */
  accessibilityHint?: string;

  /** Accessibility label for left swipe action */
  leftAccessibilityLabel?: string;

  /** Accessibility label for right swipe action */
  rightAccessibilityLabel?: string;

  children: React.ReactNode;
}

export const SwipeableListItem: React.FC<SwipeableListItemProps> = ({
  children,
  containerClassName,
  leftClassName,
  rightClassName,
  leftContent,
  rightContent,
  leftWidth = ScreenWidth / 3,
  rightWidth = ScreenWidth / 3,
  onSwipeBegin,
  onSwipeEnd,
  animation = { type: 'spring', duration: 200 },
  accessibilityLabel,
  accessibilityHint,
  leftAccessibilityLabel,
  rightAccessibilityLabel,
}) => {
  const translateX = React.useRef(new Animated.Value(0));
  const panX = React.useRef(0);

  const slideAnimation = React.useCallback(
    (toValue: number) => {
      panX.current = toValue;
      Animated[animation.type || 'spring'](translateX.current, {
        toValue,
        useNativeDriver: true,
        duration: animation.duration || 200,
      }).start();
    },
    [animation.duration, animation.type],
  );

  const resetCallBack = React.useCallback(() => {
    slideAnimation(0);
  }, [slideAnimation]);

  const onMove = React.useCallback(
    (_: unknown, { dx }: PanResponderGestureState) => {
      let position = panX.current + dx;

      if (position > 0) {
        if (!leftContent) {
          position = 0;
        } else {
          if (position > leftWidth) {
            position = leftWidth + (position - leftWidth) / 3;
          }
        }
      }

      if (position < 0) {
        if (!rightContent) {
          position = 0;
        } else {
          if (position < -rightWidth) {
            position = -rightWidth + (position + rightWidth) / 3;
          }
        }
      }

      translateX.current.setValue(position);
    },
    [leftContent, leftWidth, rightContent, rightWidth],
  );

  const onRelease = React.useCallback(
    (_: unknown, { dx }: PanResponderGestureState) => {
      const position = panX.current + dx;

      if (position > 0 && position > leftWidth / 2 && leftContent) {
        slideAnimation(leftWidth);
      } else if (position < 0 && position < -rightWidth / 2 && rightContent) {
        slideAnimation(-rightWidth);
      } else {
        slideAnimation(0);
      }
    },
    [leftContent, leftWidth, rightContent, rightWidth, slideAnimation],
  );

  const shouldSlide = React.useCallback(
    (_: unknown, { dx, dy, vx, vy }: PanResponderGestureState): boolean => {
      if (dx > 0 && !leftContent && !panX.current) {
        return false;
      }
      if (dx < 0 && !rightContent && !panX.current) {
        return false;
      }
      return Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(vx) > Math.abs(vy) * 2.5;
    },
    [leftContent, rightContent],
  );

  const _panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: shouldSlide,
        onPanResponderGrant: (_event, { vx }) => {
          onSwipeBegin?.(vx > 0 ? 'left' : 'right');
        },
        onPanResponderMove: onMove,
        onPanResponderRelease: onRelease,
        onPanResponderReject: onRelease,
        onPanResponderTerminate: onRelease,
        onPanResponderEnd: () => {
          onSwipeEnd?.();
        },
      }),
    [onMove, onRelease, onSwipeBegin, onSwipeEnd, shouldSlide],
  );

  return (
    <View
      className={clx('justify-center', containerClassName)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || 'Swipeable item'}
      accessibilityHint={
        accessibilityHint ||
        `Swipe ${leftContent ? 'right' : ''}${leftContent && rightContent ? ' or ' : ''}${
          rightContent ? 'left' : ''
        } for actions`
      }
      accessibilityActions={[
        ...(leftContent
          ? [
              {
                name: 'swipeRight' as const,
                label: leftAccessibilityLabel || 'Swipe right for action',
              },
            ]
          : []),
        ...(rightContent
          ? [
              {
                name: 'swipeLeft' as const,
                label: rightAccessibilityLabel || 'Swipe left for action',
              },
            ]
          : []),
      ]}
    >
      <View className="absolute inset-0 flex-1 flex-row justify-between overflow-hidden">
        <View
          className={clx('z-10 w-1/2 flex-row items-start justify-start', leftClassName)}
          accessible={!!leftContent}
          accessibilityElementsHidden={!leftContent}
        >
          <Animated.View
            style={[
              {
                width: leftWidth,
                height: '100%',
              },
              {
                transform: [
                  {
                    translateX: translateX.current.interpolate({
                      inputRange: [0, leftWidth],
                      outputRange: [-leftWidth, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {typeof leftContent === 'function' ? leftContent(resetCallBack) : leftContent}
          </Animated.View>
        </View>
        <View className="flex-none" />
        <View
          className={clx('z-10 w-1/2 flex-row items-start justify-end', rightClassName)}
          accessible={!!rightContent}
          accessibilityElementsHidden={!rightContent}
        >
          <Animated.View
            style={[
              {
                width: rightWidth,
                height: '100%',
              },
              {
                transform: [
                  {
                    translateX: translateX.current.interpolate({
                      inputRange: [-rightWidth, 0],
                      outputRange: [0, rightWidth],
                    }),
                  },
                ],
              },
            ]}
          >
            {typeof rightContent === 'function' ? rightContent(resetCallBack) : rightContent}
          </Animated.View>
        </View>
      </View>
      <Animated.View
        style={{
          transform: [
            {
              translateX: translateX.current,
            },
          ],
        }}
        {..._panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
};
