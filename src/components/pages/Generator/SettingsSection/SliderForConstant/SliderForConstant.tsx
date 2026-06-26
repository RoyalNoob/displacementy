import {Slider} from '@/components/ui/Slider';
import {type SettingDualConstant, type SettingConstant} from '../../constants';
import {type NumberDual} from '@/types';

type SliderForConstantCommonProps = {
  readonly label: string;
  readonly locked?: boolean;
  readonly onToggleLock?: () => void;
};

type SliderForConstantSingleProps = {
  dual?: false;
  readonly value: number;
  readonly setValue: (value: number) => void;
  readonly constant: SettingConstant;
};

type SliderForConstantDualProps = {
  dual: true;
  readonly values: NumberDual;
  readonly setValues: (values: NumberDual) => void;
  readonly constant: SettingDualConstant;
};

type SliderForConstantProps = SliderForConstantCommonProps &
  (SliderForConstantSingleProps | SliderForConstantDualProps);

export function SliderForConstant(props: SliderForConstantProps) {
  if (props.dual) {
    const {label, constant, values, setValues, locked, onToggleLock} = props;
    return (
      <Slider
        dual
        label={label}
        min={constant.min}
        max={constant.max}
        step={constant.step}
        values={values}
        setValues={setValues}
        locked={locked}
        onToggleLock={onToggleLock}
      />
    );
  }

  const {label, constant, value, setValue, locked, onToggleLock} = props;
  return (
    <Slider
      label={label}
      min={constant.min}
      max={constant.max}
      step={constant.step}
      value={value}
      setValue={setValue}
      locked={locked}
      onToggleLock={onToggleLock}
    />
  );
}
