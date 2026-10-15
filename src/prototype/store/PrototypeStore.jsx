import { useReducer, useMemo } from 'react'
import { reducer, estadoInicial } from './reducer'
import { ProtoCtx } from './contexto'

export default function PrototypeStore({ children, hoje }) {
  const [estado, dispatch] = useReducer(reducer, hoje, estadoInicial)
  const valor = useMemo(() => ({ estado, dispatch }), [estado])
  return <ProtoCtx.Provider value={valor}>{children}</ProtoCtx.Provider>
}
