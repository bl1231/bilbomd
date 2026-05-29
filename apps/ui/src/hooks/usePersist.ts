import { useState, useEffect } from 'react'

const readPersist = (): boolean => {
  try {
    return JSON.parse(localStorage.getItem('persist') as string) === true
  } catch {
    // Corrupted or non-JSON value in localStorage — fall back to false
    return false
  }
}

const usePersist = (): [boolean, React.Dispatch<React.SetStateAction<boolean>>] => {
  const [persist, setPersist] = useState<boolean>(readPersist)

  useEffect(() => {
    localStorage.setItem('persist', JSON.stringify(persist))
  }, [persist])

  return [persist, setPersist]
}

export default usePersist
